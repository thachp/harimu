"""Production policy SQL: finite reserves and shared wage budget under real races."""
import importlib.util
import pathlib
import sqlite3
import tempfile
import threading
import unittest
import json

spec=importlib.util.spec_from_file_location('economy_fixture',pathlib.Path(__file__).with_name('economy.test.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
sql=fixture.sql

class PolicyTests(unittest.TestCase):
    def setUp(self):
        fixture.EconomyTests.setUp(self)
        self.db.execute("INSERT INTO economy_funds VALUES ('kindle-merchant',10000)")
        self.db.execute("INSERT INTO market_items VALUES ('food','Food',150,100,0)")
        self.db.execute("INSERT INTO world_supply VALUES ('kindle-food-supplier',40,100)")
        self.db.commit()
    def tearDown(self):self.db.close()
    def tick(self,number,scheduled=1000,proposal=1000,topic='food'):
        snapshot=json.dumps([{'decision':{'topic':topic,'proposedSpendMinor':proposal}}])
        self.db.execute('INSERT OR IGNORE INTO world_ticks VALUES (?,?,?,?)',(number,scheduled,scheduled,snapshot));self.db.commit()
    def execute(self,tick=1):
        with self.db:return self.db.execute(sql('policyExecutionSql'),(10000,tick)).rowcount
    def test_finite_supplier_integer_money_and_no_cross_topic_spending(self):
        self.db.execute("UPDATE world_supply SET initial_food=3");self.db.commit();self.tick(1)
        self.assertEqual(self.execute(),1)
        self.assertEqual(self.db.execute('SELECT food_quantity,spend_minor FROM government_policy_executions').fetchone(),(3,300))
        self.tick(2);self.assertEqual(self.execute(2),0)
        self.tick(3,topic='work');self.assertEqual(self.execute(3),0)
        self.assertEqual(self.db.execute("SELECT stock FROM merchant_inventory_balances WHERE item='food'").fetchone()[0],3)
    def test_daily_limit_and_recorded_winner_proposal_replay(self):
        for number in [1,2,3]:self.tick(number,scheduled=number*1000,proposal=100)
        self.assertEqual(self.execute(1),1);self.assertEqual(self.execute(2),1);self.assertEqual(self.execute(3),0)
        self.assertEqual(self.db.execute('SELECT SUM(food_quantity),SUM(spend_minor) FROM government_policy_executions').fetchone(),(2,200))
        self.tick(1,proposal=1000) # competing replay cannot replace the persisted winner.
        self.assertEqual(self.execute(1),0)
        self.tick(4,scheduled=86400,proposal=100);self.assertEqual(self.execute(4),1)
    def test_policy_failure_rolls_back_tick_and_receipt(self):
        self.db.executescript("CREATE TRIGGER fail_policy BEFORE INSERT ON government_policy_executions BEGIN SELECT RAISE(ABORT,'failure'); END;")
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                self.db.execute('INSERT INTO world_ticks VALUES (1,1000,1000,?)',(json.dumps([{'decision':{'topic':'food','proposedSpendMinor':1000}}]),))
                self.db.execute(sql('policyExecutionSql'),(1000,1))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM world_ticks').fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM government_policy_executions').fetchone()[0],0)
    def test_separate_connection_wage_policy_race_and_reconnect_conserve_funds_goods(self):
        self.tick(1)
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'wage-policy.sqlite';disk=sqlite3.connect(path);self.db.backup(disk);disk.close()
            barrier=threading.Barrier(2);failures=[]
            now='2026-10-12T02:00:00.000Z'
            def worker(kind):
                connection=sqlite3.connect(path,timeout=10)
                try:
                    barrier.wait(timeout=10)
                    with connection:
                        if kind=='policy':connection.execute(sql('policyExecutionSql'),(10000,1))
                        else:
                            connection.execute(sql('settleSql'),(now,'a','alice',now))
                            connection.execute(sql('settledContributionSql'),(now,'a','alice',now))
                            connection.execute(sql('finishSettledShiftSql'),(now,'a','alice',now))
                except Exception as error:failures.append(str(error))
                finally:connection.close()
            threads=[threading.Thread(target=worker,args=(kind,)) for kind in ['policy','wage']]
            for thread in threads:thread.start()
            for thread in threads:thread.join(timeout=15)
            self.assertTrue(all(not thread.is_alive() for thread in threads));self.assertEqual(failures,[])
            connection=sqlite3.connect(path)
            try:
                wages=connection.execute('SELECT COALESCE(SUM(wage_minor),0) FROM shift_settlements').fetchone()[0]
                spend,food=connection.execute('SELECT COALESCE(SUM(spend_minor),0),COALESCE(SUM(food_quantity),0) FROM government_policy_executions').fetchone()
                self.assertEqual(wages+spend,1000)
                self.assertIn((wages,spend),[(0,1000),(800,200)])
                self.assertEqual(spend,food*100)
                stock=connection.execute("SELECT stock FROM merchant_inventory_balances WHERE item='food'").fetchone()[0]
                self.assertEqual(stock,food);self.assertEqual(stock+40-food,40)
                with connection:
                    self.assertEqual(connection.execute(sql('policyExecutionSql'),(10000,1)).rowcount,0)
                    self.assertEqual(connection.execute(sql('settleSql'),(now,'a','alice',now)).rowcount,0)
                self.assertEqual(connection.execute('SELECT COUNT(*) FROM government_policy_executions').fetchone()[0],1)
                self.assertEqual(connection.execute('SELECT COUNT(*) FROM work_contributions').fetchone()[0],int(wages>0))
            finally:connection.close()

if __name__=='__main__':unittest.main()
