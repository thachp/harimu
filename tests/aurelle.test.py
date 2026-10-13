"""Actual evaluated Aurelle SQL on isolated competing account connections."""
import importlib.util
import json
import pathlib
import sqlite3
import subprocess
import tempfile
import threading
import unittest
import uuid

root=pathlib.Path(__file__).parents[1]
exports=json.loads(subprocess.check_output(['node','--experimental-strip-types','--input-type=module','-e',
    "import * as rules from './lib/aurelle.ts'; console.log(JSON.stringify(rules));"],cwd=root,text=True))
def sql(name):return exports[name]
spec=importlib.util.spec_from_file_location('economy_fixture',pathlib.Path(__file__).with_name('economy.test.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)

class AurelleTests(unittest.TestCase):
    def setUp(self):
        fixture.EconomyTests.setUp(self)
        self.db.execute('DELETE FROM shift_rewards');self.db.execute('DELETE FROM work_shifts')
        self.db.execute("UPDATE citizens SET nation_id='aurelle',capacity=18")
        self.db.execute("INSERT INTO work_orders VALUES ('aurelle-food-estate')")
        for schema in exports['aurelleSchemas']:self.db.execute(schema)
        self.db.execute("INSERT INTO aurelle_resources VALUES ('estate',40,100000)");self.db.commit()
        self.db.execute('PRAGMA foreign_keys=ON')
    def tearDown(self):self.db.close()
    def start(self,db,user,id):
        count=db.execute(sql('aurelleStartReceiptSql'),(id,1000,user,id)).rowcount
        db.execute(sql('aurelleStartSql'),('2026-10-12T00:00:00.000Z','2026-10-12T02:00:00.000Z',id,user))
        db.execute(sql('aurelleStartDebitSql'),('2026-10-12T00:00:00.000Z',user,id))
        db.execute("UPDATE aurelle_receipts SET capacity_applied=1 WHERE id=? AND clerk_user_id=? AND action='aurelle-start-work'",(id,user))
        return count
    def claim(self,db,user,shift,id):
        count=db.execute(sql('aurelleClaimReceiptSql'),(id,10000,shift,user,'2026-10-12T02:00:00.000Z',id)).rowcount
        db.execute(sql('aurelleSettleSql'),(10000,id,user))
        db.execute("UPDATE work_shifts SET claimed_at=? WHERE id=? AND clerk_user_id=? AND EXISTS(SELECT 1 FROM aurelle_settlements WHERE shift_id=work_shifts.id)",('2026-10-12T02:00:00.000Z',shift,user))
        return count
    def buy(self,db,user,id,quantity=2):
        count=db.execute(sql('aurelleBuyReceiptSql'),(id,quantity,10000,user,quantity,quantity,quantity,id)).rowcount
        db.execute(sql('aurelleBuySql'),(id,user,quantity));return count
    def meal(self,db,user,id):
        count=db.execute(sql('aurelleMealReceiptSql'),(id,10000,user,10000,id)).rowcount
        db.execute(sql('aurelleMealSql'),(id,user));db.execute(sql('aurelleMealCapacitySql'),('2026-10-12T02:00:00.000Z',user,id))
        db.execute("UPDATE aurelle_receipts SET capacity_applied=1 WHERE id=? AND clerk_user_id=? AND action='aurelle-household-meal'",(id,user))
        return count
    def fund(self,user):
        shift=str(uuid.uuid4())
        with self.db:self.start(self.db,user,shift);self.claim(self.db,user,shift,str(uuid.uuid4()))
        return shift
    def race(self,workers):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'aurelle.sqlite';disk=sqlite3.connect(path);self.db.backup(disk);disk.close()
            barrier=threading.Barrier(len(workers));failures=[];results=[]
            def run(worker):
                db=sqlite3.connect(path,timeout=10);db.execute('PRAGMA foreign_keys=ON')
                try:
                    barrier.wait(timeout=10)
                    with db:results.append(worker(db))
                except Exception as error:failures.append(str(error))
                finally:db.close()
            threads=[threading.Thread(target=run,args=(worker,)) for worker in workers]
            for thread in threads:thread.start()
            for thread in threads:thread.join(timeout=15)
            self.assertTrue(all(not thread.is_alive() for thread in threads));self.assertEqual(failures,[])
            disk=sqlite3.connect(path);dump='\n'.join(disk.iterdump());disk.close()
            self.db.close();self.db=sqlite3.connect(':memory:');self.db.executescript(dump);self.db.execute('PRAGMA foreign_keys=ON')
            return results
    def test_two_account_last_food_race_conserves_crowns_and_replays_after_reconnect(self):
        for user in ['alice','bob']:self.fund(user)
        # Two funded shifts produce 8 goods. Each account buys 3, leaving 2.
        self.db.execute('UPDATE aurelle_resources SET initial_food=0');self.db.commit()
        for user in ['alice','bob']:
            with self.db:self.buy(self.db,user,str(uuid.uuid4()),2);self.buy(self.db,user,str(uuid.uuid4()),1)
        ids={user:str(uuid.uuid4()) for user in ['alice','bob']}
        self.assertEqual(sum(self.race([lambda db,u=user:self.buy(db,u,ids[u],2) for user in ids])),1)
        wages,spend=self.db.execute('SELECT (SELECT SUM(wage_minor) FROM aurelle_settlements),(SELECT SUM(spend_minor) FROM aurelle_purchases)').fetchone()
        self.assertEqual((wages,spend),(1600,1200));self.assertEqual(100000+spend-wages+(wages-spend),100000)
        self.assertEqual(self.db.execute('SELECT SUM(quantity) FROM aurelle_purchases').fetchone()[0],8)
        for user in ids:
            with self.db:self.assertEqual(self.buy(self.db,user,ids[user],2),0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM aurelle_purchases').fetchone()[0],5)
    def test_two_account_last_wage_pool_race_and_foreign_claim_denial(self):
        self.db.execute('UPDATE aurelle_resources SET initial_minor=800');self.db.commit()
        shifts={user:str(uuid.uuid4()) for user in ['alice','bob']};requests={user:str(uuid.uuid4()) for user in shifts}
        with self.db:
            for user in shifts:self.start(self.db,user,shifts[user])
        self.assertEqual(sum(self.race([lambda db,u=user:self.claim(db,u,shifts[u],requests[u]) for user in shifts])),1)
        self.assertEqual(self.db.execute('SELECT SUM(wage_minor),SUM(food_output),SUM(favor) FROM aurelle_settlements').fetchone(),(800,4,2))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM work_shifts WHERE claimed_at IS NULL').fetchone()[0],1)
        for user,other in [('alice','bob'),('bob','alice')]:
            with self.db:
                self.assertEqual(self.claim(self.db,other,shifts[user],str(uuid.uuid4())),0)
                self.assertEqual(self.claim(self.db,user,shifts[user],requests[user]),0)
    def test_duplicate_meal_race_applies_capacity_once_and_cross_action_id_cannot_write(self):
        self.fund('alice')
        with self.db:self.buy(self.db,'alice',str(uuid.uuid4()),2)
        self.db.execute("UPDATE citizens SET capacity=23 WHERE clerk_user_id='alice'");self.db.commit()
        id=str(uuid.uuid4())
        self.assertEqual(sum(self.race([lambda db:self.meal(db,'alice',id),lambda db:self.meal(db,'alice',id)])),1)
        self.assertEqual(self.db.execute("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").fetchone()[0],24)
        self.assertEqual(self.db.execute('SELECT SUM(quantity) FROM aurelle_meals').fetchone()[0],2)
        with self.db:self.assertEqual(self.buy(self.db,'alice',id,1),0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM aurelle_purchases').fetchone()[0],1)
    def test_failed_purchase_rolls_back_receipt_then_retry_retains_integer_terms(self):
        self.fund('alice');id=str(uuid.uuid4())
        self.db.executescript("CREATE TRIGGER fail_purchase BEFORE INSERT ON aurelle_purchases BEGIN SELECT RAISE(ABORT,'fixture failure'); END;")
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:self.buy(self.db,'alice',id,2)
        self.assertIsNone(self.db.execute('SELECT id FROM aurelle_receipts WHERE id=?',(id,)).fetchone())
        self.db.execute('DROP TRIGGER fail_purchase');self.db.commit()
        with self.db:self.assertEqual(self.buy(self.db,'alice',id,2),1)
        self.assertEqual(self.db.execute('SELECT quantity,spend_minor FROM aurelle_purchases').fetchone(),(2,300))

    def test_competing_quantity_and_account_replays_preserve_single_request_binding(self):
        for user in ['alice','bob']:self.fund(user)
        id=str(uuid.uuid4())
        self.assertEqual(sum(self.race([lambda db:self.buy(db,'alice',id,1),lambda db:self.buy(db,'alice',id,2)])),1)
        quantity,spend=self.db.execute('SELECT quantity,spend_minor FROM aurelle_purchases WHERE id=?',(id,)).fetchone()
        self.assertIn(quantity,[1,2]);self.assertEqual(spend,quantity*150)
        self.assertEqual(self.db.execute('SELECT quantity FROM aurelle_receipts WHERE id=?',(id,)).fetchone()[0],quantity)
        foreign=str(uuid.uuid4())
        self.assertEqual(sum(self.race([lambda db:self.buy(db,'alice',foreign,2),lambda db:self.buy(db,'bob',foreign,2)])),1)
        owner=self.db.execute('SELECT clerk_user_id FROM aurelle_receipts WHERE id=?',(foreign,)).fetchone()[0]
        self.assertEqual(self.db.execute('SELECT clerk_user_id FROM aurelle_purchases WHERE id=?',(foreign,)).fetchone()[0],owner)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM aurelle_purchases').fetchone()[0],2)

if __name__=='__main__':unittest.main()
