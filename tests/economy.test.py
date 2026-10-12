"""Production SQLite settlement/recovery rules, including failures and replay."""
import pathlib
import re
import sqlite3
import unittest
import tempfile
import threading
import json

root = pathlib.Path(__file__).parents[1]
source = (root / 'lib/economy.ts').read_text() + (root / 'lib/work-shifts.ts').read_text()
def sql(name):
    return re.search(r'export const ' + name + r' = `([^`]+)`', source).group(1)

class EconomyTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''CREATE TABLE citizens (clerk_user_id TEXT PRIMARY KEY,
          nation_id TEXT, capacity INTEGER, updated_at TEXT);
          CREATE TABLE work_orders(id TEXT PRIMARY KEY);
          CREATE TABLE work_contributions(clerk_user_id TEXT, work_order_id TEXT, capacity_spent INTEGER, created_at TEXT);
          INSERT INTO citizens VALUES ('alice','kindle',4,''),('bob','kindle',4,'');
          INSERT INTO work_orders VALUES ('harvest');''')
        for name in ['shiftSchema', 'activeShiftIndex', 'economySchema', 'recoverySchema', 'rewardSchema', 'fundSchema']:
            self.db.execute(sql(name))
        self.db.execute("INSERT INTO economy_funds VALUES ('kindle-employer',1000)")
        self.db.execute("INSERT INTO capacity_clocks VALUES ('alice',1000)")
        for id, user in [('a','alice'), ('b','bob')]:
            self.db.execute('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,NULL)',
              (id,user,'harvest','Harvest','480 food',4,'2026-10-12T00:00:00.000Z','2026-10-12T02:00:00.000Z'))
            self.db.execute('INSERT INTO shift_rewards VALUES (?,800,\'food\',4)',(id,))
        self.db.commit()

    def settle(self, id='a', user='alice', now='2026-10-12T02:00:00.000Z', fail=False):
        with self.db:
            self.db.execute(sql('settleSql'),(now,id,user,now))
            if fail: self.db.execute('INSERT INTO missing VALUES (1)')
            self.db.execute(sql('settledContributionSql'),(now,id,user,now))
            self.db.execute(sql('finishSettledShiftSql'),(now,id,user,now))

    def test_once_after_restart_and_reward_terms_are_fixed(self):
        self.settle()
        dump='\n'.join(self.db.iterdump())
        self.db.close();self.db=sqlite3.connect(':memory:');self.db.executescript(dump)
        self.db.execute("UPDATE shift_rewards SET wage_minor=999 WHERE shift_id='a'")
        self.db.commit()
        self.settle()
        self.assertEqual(self.db.execute('SELECT SUM(wage_minor),SUM(quantity) FROM shift_settlements').fetchone(),(800,4))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM work_contributions').fetchone()[0],1)

    def test_no_early_or_cross_account_reward(self):
        self.settle(now='2026-10-12T01:59:59.999Z');self.settle(user='bob')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM shift_settlements').fetchone()[0],0)

    def test_wallet_and_inventory_share_one_read_snapshot(self):
        self.settle()
        wallet, inventory, clock = self.db.execute(sql('economySnapshotSql'), ('alice','alice','alice')).fetchone()
        self.assertEqual(wallet, 800)
        self.assertEqual(json.loads(inventory), [{'item':'food', 'quantity':4}])
        self.assertEqual(clock, 1000)

    def test_failure_rolls_back_wallet_inventory_and_completion_then_retry(self):
        with self.assertRaises(sqlite3.OperationalError): self.settle(fail=True)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM shift_settlements').fetchone()[0],0)
        self.assertIsNone(self.db.execute("SELECT claimed_at FROM work_shifts WHERE id='a'").fetchone()[0])
        self.settle();self.settle()
        self.assertEqual(self.db.execute('SELECT SUM(wage_minor),SUM(quantity) FROM shift_settlements').fetchone(),(800,4))

    def test_finite_funds_and_retry_preserves_finished_shift(self):
        self.settle();self.settle('b','bob')
        self.assertIsNone(self.db.execute("SELECT claimed_at FROM work_shifts WHERE id='b'").fetchone()[0])
        self.assertEqual(self.db.execute('SELECT SUM(wage_minor) FROM shift_settlements').fetchone()[0],800)
        self.db.execute("UPDATE economy_funds SET initial_minor=2000");self.db.commit()
        self.settle('b','bob');self.settle('b','bob')
        self.assertEqual(self.db.execute('SELECT SUM(wage_minor) FROM shift_settlements').fetchone()[0],1600)

    def recover(self, now, fail=False):
        with self.db:
            self.db.execute(sql('recoverCapacitySql'),(24,now,'alice',86400,24,'alice'))
            if fail: self.db.execute('UPDATE missing SET id=0')
            self.db.execute(sql('advanceClockSql'),(now,86400,86400,'alice'))

    def test_recovery_boundary_replay_offline_and_backward_clock(self):
        self.recover(1000+86399)
        self.assertEqual(self.db.execute("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").fetchone()[0],4)
        self.recover(1000+86400)
        self.db.execute("UPDATE citizens SET capacity=2 WHERE clerk_user_id='alice'");self.db.commit()
        self.recover(1000+86400);self.recover(999)
        self.assertEqual(self.db.execute("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").fetchone()[0],2)
        self.recover(1000+5*86400+42)
        self.assertEqual(self.db.execute("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").fetchone()[0],24)
        self.assertEqual(self.db.execute('SELECT recovered_at FROM capacity_clocks').fetchone()[0],1000+5*86400)

    def test_recovery_rollback(self):
        with self.assertRaises(sqlite3.OperationalError): self.recover(1000+86400,True)
        self.assertEqual(self.db.execute("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").fetchone()[0],4)
        self.assertEqual(self.db.execute('SELECT recovered_at FROM capacity_clocks').fetchone()[0],1000)

    def test_money_and_goods_reject_fractional_units(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO shift_settlements VALUES (?,?,?,?,?,?)',('a','alice',0.5,'food',4,''))

    def test_concurrent_claims_credit_once(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'economy.sqlite'
            disk = sqlite3.connect(path)
            self.db.backup(disk)
            disk.close()
            barrier = threading.Barrier(2)
            failures = []
            def worker():
                connection = sqlite3.connect(path, timeout=10)
                try:
                    barrier.wait()
                    connection.execute('BEGIN IMMEDIATE')
                    now = '2026-10-12T02:00:00.000Z'
                    connection.execute(sql('settleSql'), (now,'a','alice',now))
                    connection.execute(sql('settledContributionSql'), (now,'a','alice',now))
                    connection.execute(sql('finishSettledShiftSql'), (now,'a','alice',now))
                    connection.commit()
                except Exception as error:
                    failures.append(str(error))
                finally:
                    connection.close()
            threads = [threading.Thread(target=worker) for _ in range(2)]
            for thread in threads: thread.start()
            for thread in threads: thread.join()
            self.assertEqual(failures, [])
            disk = sqlite3.connect(path)
            self.assertEqual(disk.execute('SELECT SUM(wage_minor), SUM(quantity) FROM shift_settlements').fetchone(), (800,4))
            self.assertEqual(disk.execute('SELECT COUNT(*) FROM work_contributions').fetchone()[0], 1)
            disk.close()

if __name__ == '__main__': unittest.main()
