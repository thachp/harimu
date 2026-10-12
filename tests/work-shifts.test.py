"""Exercise the production SQL against SQLite, including replay and restart."""
import pathlib
import re
import sqlite3
import unittest

source = (pathlib.Path(__file__).parents[1] / 'lib/work-shifts.ts').read_text()
def sql(name):
    return re.search(r'export const ' + name + r' = `([^`]+)`', source).group(1)

class ShiftTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''CREATE TABLE citizens (clerk_user_id TEXT PRIMARY KEY,
            nation_id TEXT, capacity INTEGER, updated_at TEXT);
            CREATE TABLE work_orders (id TEXT PRIMARY KEY);
            CREATE TABLE work_contributions (clerk_user_id TEXT, work_order_id TEXT,
                capacity_spent INTEGER, created_at TEXT);
            INSERT INTO citizens VALUES ('alice', 'kindle', 18, ''), ('bob', 'korund', 18, '');
            INSERT INTO work_orders VALUES ('harvest');''')
        self.db.execute(sql('shiftSchema'))
        self.db.execute(sql('activeShiftIndex'))

    def start(self, id='shift1', user='alice', cost=4, nation='kindle'):
        with self.db:
            count = self.db.execute(sql('startShiftSql'), (id, 'harvest', 'Harvest', '480 food', cost,
                '2026-10-12T00:00:00.000Z', '2026-10-12T02:00:00.000Z', user, cost, nation, nation, user)).rowcount
            self.db.execute(sql('debitShiftSql'), (cost, '', user, id, user))
        return count

    def claim(self, user='alice', now='2026-10-12T02:00:00.000Z'):
        with self.db:
            self.db.execute(sql('recordShiftSql'), (now, 'shift1', user, now))
            self.db.execute(sql('claimShiftSql'), (now, 'shift1', user, now))

    def test_overlap_and_insufficient_capacity(self):
        self.assertEqual(self.start(cost=30), 0)
        self.assertEqual(self.start(), 1)
        self.assertEqual(self.start(id='shift2'), 0)
        self.assertEqual(self.db.execute("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").fetchone()[0], 14)

    def test_wrong_nation_and_cross_account_claim(self):
        self.assertEqual(self.start(user='bob'), 0)
        self.start()
        self.claim(user='bob')
        self.assertEqual(self.db.execute('SELECT count(*) FROM work_contributions').fetchone()[0], 0)

    def test_early_claim_and_replay_after_restart(self):
        self.start()
        self.claim(now='2026-10-12T01:59:59.999Z')
        self.assertEqual(self.db.execute('SELECT count(*) FROM work_contributions').fetchone()[0], 0)
        # Restore persisted state into a fresh connection, then finish offline work.
        dump = '\n'.join(self.db.iterdump())
        self.db.close()
        self.db = sqlite3.connect(':memory:')
        self.db.executescript(dump)
        self.claim()
        self.claim()
        self.assertEqual(self.db.execute('SELECT count(*) FROM work_contributions').fetchone()[0], 1)
        self.assertEqual(self.start(id='shift2'), 1)

    def test_schedule_and_debit_rollback_together(self):
        with self.assertRaises(sqlite3.OperationalError):
            with self.db:
                self.db.execute(sql('startShiftSql'), ('shift1', 'harvest', 'Harvest', '480 food', 4,
                    '2026-10-12T00:00:00.000Z', '2026-10-12T02:00:00.000Z', 'alice', 4, 'kindle', 'kindle', 'alice'))
                self.db.execute('UPDATE nonexistent SET capacity = 0')
        self.assertEqual(self.db.execute('SELECT count(*) FROM work_shifts').fetchone()[0], 0)

if __name__ == '__main__':
    unittest.main()
