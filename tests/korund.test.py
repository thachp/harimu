"""Separate local account connections race actual Korund command SQL."""
import importlib.util
import pathlib
import re
import sqlite3
import tempfile
import threading
import unittest
import uuid

spec=importlib.util.spec_from_file_location('economy_fixture',pathlib.Path(__file__).with_name('economy.test.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
source=(pathlib.Path(__file__).parents[1]/'lib/korund.ts').read_text()
queue_source=(pathlib.Path(__file__).parents[1]/'lib/korund-queue.ts').read_text()
posts_source=(pathlib.Path(__file__).parents[1]/'lib/korund-posts.ts').read_text() # #886 (b): korund_post_settlements, read by the pool
active_queue=re.search(r'export const activeRationQueue=`([^`]+)`',queue_source).group(1)
def sql(name):return re.search(r'export const '+name+r' = `([^`]+)`',source).group(1).replace('${activeRationQueue}',active_queue)

class KorundTests(unittest.TestCase):
    def setUp(self):
        fixture.EconomyTests.setUp(self)
        self.db.execute('DELETE FROM work_shifts')
        self.db.execute('DELETE FROM shift_rewards')
        self.db.execute("UPDATE citizens SET nation_id='korund',capacity=18")
        self.db.execute("INSERT INTO work_orders VALUES ('korund-food-production')")
        for schema in re.findall(r'`(CREATE [^`]+)`',source+queue_source+posts_source):self.db.execute(schema)
        self.db.execute("INSERT INTO korund_resources VALUES ('state',40,100000)");self.db.commit()
    def tearDown(self):self.db.close()
    def race(self,workers):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'korund.sqlite';disk=sqlite3.connect(path);self.db.backup(disk);disk.close()
            barrier=threading.Barrier(len(workers));failures=[];results=[]
            def run(worker):
                connection=sqlite3.connect(path,timeout=10)
                try:
                    barrier.wait(timeout=10)
                    with connection:results.append(worker(connection))
                except Exception as error:failures.append(str(error))
                finally:connection.close()
            threads=[threading.Thread(target=run,args=(worker,)) for worker in workers]
            for thread in threads:thread.start()
            for thread in threads:thread.join(timeout=15)
            self.assertTrue(all(not thread.is_alive() for thread in threads));self.assertEqual(failures,[])
            disk=sqlite3.connect(path);dump='\n'.join(disk.iterdump());disk.close()
            self.db.close();self.db=sqlite3.connect(':memory:');self.db.executescript(dump)
            return results
    def ration(self,connection,user,id,week=1):
        return connection.execute(sql('korundRationSql'),(id,week,1000,user,user,week,id,id,id,id,week,1000,week,1000,user,week,1000)).rowcount
    def start(self,connection,user,id):
        count=connection.execute(sql('korundStartSql'),(id,'2026-10-12T00:00:00.000Z','2026-10-12T02:00:00.000Z',user,user,id,id,id,id)).rowcount
        connection.execute(sql('korundStartReceiptSql'),(id,user))
        connection.execute(sql('korundDebitSql'),('2026-10-12T00:00:00.000Z',user,id))
        connection.execute('UPDATE korund_work_starts SET capacity_applied=1 WHERE id=?',(id,))
        return count
    def test_two_account_last_ration_race_and_reconnect_conserve_state_food(self):
        self.db.execute('UPDATE korund_resources SET initial_food=2');self.db.commit()
        ids={user:str(uuid.uuid4()) for user in ['alice','bob']}
        results=self.race([lambda db,u=user:self.ration(db,u,ids[u]) for user in ids])
        self.assertEqual(sum(results),1)
        food,funds=self.db.execute(sql('korundPublicFoodSql')).fetchone();self.assertEqual(food,0);self.assertEqual(funds,100000)
        self.assertEqual(self.db.execute('SELECT SUM(quantity) FROM korund_rations').fetchone()[0],2)
        for user in ids:self.assertEqual(self.ration(self.db,user,ids[user]),0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM korund_rations').fetchone()[0],1)
    def test_two_account_duplicate_id_and_same_account_cross_action_races(self):
        id=str(uuid.uuid4())
        self.assertEqual(sum(self.race([lambda db:self.ration(db,'alice',id),lambda db:self.ration(db,'bob',id)])),1)
        self.assertEqual(self.db.execute('SELECT SUM(quantity) FROM korund_rations').fetchone()[0],2)
        cross=str(uuid.uuid4())
        results=self.race([lambda db:self.start(db,'alice',cross),lambda db:self.ration(db,'alice',cross,2)])
        self.assertEqual(sum(results),1)
        receipts=self.db.execute('SELECT (SELECT COUNT(*) FROM korund_work_starts WHERE id=?)+(SELECT COUNT(*) FROM korund_rations WHERE id=?)',(cross,cross)).fetchone()[0]
        self.assertEqual(receipts,1)
        capacity=self.db.execute("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").fetchone()[0]
        self.assertEqual(capacity,14 if self.db.execute('SELECT id FROM korund_work_starts WHERE id=?',(cross,)).fetchone() else 18)
    def test_two_account_wage_pool_race_retains_unpaid_shift_and_produces_once(self):
        self.db.execute('UPDATE korund_resources SET initial_minor=800');self.db.commit()
        ids={user:str(uuid.uuid4()) for user in ['alice','bob']}
        with self.db:
            for user in ids:self.assertEqual(self.start(self.db,user,ids[user]),1)
        now='2026-10-12T02:00:00.000Z'
        def settle(connection,user):return connection.execute(sql('korundSettleSql'),(1000,ids[user],user,now)).rowcount
        self.assertEqual(sum(self.race([lambda db,u=user:settle(db,u) for user in ids])),1)
        self.assertEqual(self.db.execute(sql('korundPublicFoodSql')).fetchone(),(44,0))
        self.assertEqual(self.db.execute('SELECT SUM(wage_minor),SUM(food_output) FROM korund_settlements').fetchone(),(800,4))
        for user in ids:self.assertEqual(settle(self.db,user),0)
        # New funds may pay the retained other shift; old payment never repeats.
        self.db.execute('UPDATE korund_resources SET initial_minor=1600');self.db.commit()
        with self.db:
            self.assertEqual(sum(settle(self.db,user) for user in ids),1)
        self.assertEqual(self.db.execute(sql('korundPublicFoodSql')).fetchone(),(48,0))
        self.assertEqual(self.db.execute('SELECT SUM(wage_minor) FROM shift_settlements').fetchone()[0],None)
    def test_meal_same_id_race_debits_household_food_once(self):
        ration=str(uuid.uuid4());meal=str(uuid.uuid4())
        with self.db:self.assertEqual(self.ration(self.db,'alice',ration),1)
        def eat(connection):return connection.execute(sql('korundMealSql'),(meal,1000,'alice',1000,meal,meal,meal,meal)).rowcount
        self.assertEqual(sum(self.race([eat,eat])),1)
        self.assertEqual(self.db.execute('SELECT SUM(quantity) FROM korund_meals').fetchone()[0],2)
        self.assertEqual(self.db.execute('SELECT SUM(quantity) FROM korund_rations').fetchone()[0],2)
        self.assertEqual(eat(self.db),0)

    def test_fifo_head_wins_last_ration_across_separate_connections(self):
        self.db.execute('UPDATE korund_resources SET initial_food=2')
        for seq,user in [(1,'alice'),(2,'bob')]:self.db.execute("INSERT INTO korund_ration_queue VALUES (?,?,?,?,?,?,'waiting')",(seq,str(uuid.uuid4()),user,1,999,2000))
        self.db.commit();ids={user:str(uuid.uuid4()) for user in ['alice','bob']}
        results=self.race([lambda db:self.ration(db,'bob',ids['bob']),lambda db:self.ration(db,'alice',ids['alice'])])
        self.assertEqual(sum(results),1);self.assertEqual(self.db.execute('SELECT clerk_user_id FROM korund_rations').fetchone()[0],'alice')
        self.assertEqual(self.db.execute(sql('korundPublicFoodSql')).fetchone()[0],0)

if __name__=='__main__':unittest.main()
