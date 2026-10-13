"""Production SQL invariants for the whole-lot player market."""
import importlib.util
import pathlib
import sqlite3
import unittest
import uuid
import tempfile
import threading
from contextlib import closing
spec=importlib.util.spec_from_file_location('market_fixture',pathlib.Path(__file__).with_name('market.test.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
sql=fixture.sql
class PlayerMarketTests(unittest.TestCase):
    setUp=fixture.MarketTests.setUp
    balance=fixture.MarketTests.balance
    food=fixture.MarketTests.food
    concurrent=fixture.MarketTests.concurrent
    trade=fixture.MarketTests.trade
    trade_params=fixture.MarketTests.trade_params
    meal=fixture.MarketTests.meal
    def create(self,user='alice',quantity=2,price=150,id=None):
        id=id or str(uuid.uuid4())
        with self.db:
            count=self.db.execute(sql('createListingSql'),(id,'food',quantity,price,1000,user,'food',quantity,id)).rowcount
        return id,count
    def fill(self,lot,user='bob',id=None):
        id=id or str(uuid.uuid4())
        with self.db:return self.db.execute(sql('fillListingSql'),(id,1001,user,lot,id)).rowcount
    def cancel(self,lot,user='alice',id=None):
        id=id or str(uuid.uuid4())
        with self.db:return self.db.execute(sql('cancelListingSql'),(id,1001,lot,user,id)).rowcount
    def test_reservation_blocks_merchant_and_meal(self):
        lot,count=self.create(quantity=5);self.assertEqual(count,1)
        self.assertEqual(self.food(),1);self.assertEqual(self.trade('sell',2),0);self.assertEqual(self.meal(),0)
        self.assertEqual(self.cancel(lot),1);self.assertEqual(self.food(),6)
    def test_whole_lot_conserves_wallet_goods_and_merchant(self):
        lot,_=self.create();self.assertEqual(self.fill(lot),1)
        self.assertEqual((self.balance(),self.balance('bob'),self.food(),self.food('bob')),(2300,1700,4,8))
        self.assertEqual(self.db.execute('SELECT balance FROM merchant_cash_balance').fetchone()[0],10000)
        self.assertEqual(self.db.execute('SELECT stock FROM merchant_inventory_balances').fetchone()[0],100)
    def test_boundaries_and_five_open_limit(self):
        for quantity,price in [(0,1),(-1,1),(1.5,1),(11,1),(1,0),(1,1001),(1,1.5)]:
            try:self.assertEqual(self.create(quantity=quantity,price=price)[1],0)
            except sqlite3.IntegrityError:pass
        for _ in range(5):self.assertEqual(self.create(quantity=1)[1],1)
        self.assertEqual(self.create(quantity=1)[1],0)
    def test_eligibility_self_purchase_funds_and_ownership(self):
        for user in ['carl','visitor','missing']:self.assertEqual(self.create(user=user)[1],0)
        lot,_=self.create(quantity=3,price=1000)
        for user in ['alice','bob','carl','visitor','missing']:self.assertEqual(self.fill(lot,user),0)
        self.assertEqual(self.cancel(lot,'bob'),0)
        self.db.execute("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'");self.db.commit()
        self.assertEqual(self.cancel(lot),1);self.assertEqual(self.food(),6)
    def test_seller_nation_change_prevents_fill(self):
        lot,_=self.create();self.db.execute("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'");self.db.commit()
        self.assertEqual(self.fill(lot),0)
    def test_request_reuse_and_restart_never_double_transfer(self):
        lot,_=self.create();request=str(uuid.uuid4());self.assertEqual(self.fill(lot,id=request),1)
        dump='\n'.join(self.db.iterdump());self.db.close();self.db=sqlite3.connect(':memory:');self.db.executescript(dump)
        self.assertEqual(self.fill(lot,id=request),0);self.assertEqual(self.cancel(lot),0)
        self.assertEqual(self.create(id=request)[1],0)
        self.assertEqual((self.balance(),self.balance('bob')),(2300,1700))
    def test_cancel_replay_and_cross_action_reuse(self):
        lot,_=self.create();request=str(uuid.uuid4());self.assertEqual(self.cancel(lot,id=request),1)
        self.assertEqual(self.cancel(lot,id=request),0);self.assertEqual(self.fill(lot),0)
        other,_=self.create();self.assertEqual(self.fill(other,id=request),0);self.assertEqual(self.food(),4)
    def test_failure_rolls_back_entire_transfer(self):
        lot,_=self.create();self.db.executescript("CREATE TRIGGER fail_fill BEFORE INSERT ON player_fills BEGIN SELECT RAISE(ABORT,'storage failure'); END;")
        with self.assertRaises(sqlite3.IntegrityError):self.fill(lot)
        self.assertEqual((self.balance(),self.balance('bob'),self.food(),self.food('bob')),(2000,2000,4,6))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM player_open_lots').fetchone()[0],1)
    def test_balance_view_reinstallation_preserves_prior_economy(self):
        self.trade('buy',2);self.meal()
        before=(self.balance(),self.food(),self.balance('bob'),self.food('bob'))
        with self.db:
            self.db.execute('DROP VIEW citizen_wallet_balances')
            self.db.execute('DROP VIEW citizen_inventory_balances')
            self.db.execute(sql('walletViewSql'));self.db.execute(sql('inventoryViewSql'))
        self.assertEqual((self.balance(),self.food(),self.balance('bob'),self.food('bob')),before)
    def test_inventory_query_respects_d1_compound_select_limit(self):
        self.db.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT,5)
        with self.db:
            self.db.execute('DROP VIEW citizen_inventory_balances')
            self.db.execute(sql('inventoryViewSql'))
        lot,_=self.create();self.assertEqual(self.fill(lot),1)
        self.assertEqual((self.food(),self.food('bob')),(4,8))
    def test_fill_ledger_snapshots_quantity_and_price(self):
        lot,_=self.create();self.assertEqual(self.fill(lot),1)
        self.db.execute('UPDATE player_listings SET quantity=5,unit_minor=900 WHERE id=?',(lot,));self.db.commit()
        self.assertEqual((self.balance(),self.balance('bob'),self.food(),self.food('bob')),(2300,1700,4,8))
    def test_concurrent_reservations_cannot_overdraw_owned_goods(self):
        def worker(db,_):
            request=str(uuid.uuid4())
            db.execute(sql('createListingSql'),(request,'food',4,100,1000,'alice','food',4,request))
        self.concurrent(worker)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM player_listings').fetchone()[0],1)
        self.assertEqual(self.food(),2)
    def test_concurrent_buyers_only_one_winner(self):
        lot,_=self.create(user='bob');self.db.execute("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='carl'")
        self.db.execute("INSERT INTO shift_settlements VALUES ('carl','carl',2000,'food',0,'')");self.db.commit()
        def worker(db,user):
            buyer='alice' if user=='alice' else 'carl';request=str(uuid.uuid4())
            db.execute(sql('fillListingSql'),(request,1001,buyer,lot,request))
        self.concurrent(worker)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM player_fills').fetchone()[0],1)
        self.assertEqual(sum(self.balance(u) for u in ['alice','bob','carl']),6000)
    def test_concurrent_cancel_and_fill_cannot_both_win(self):
        lot,_=self.create()
        def worker(db,user):
            request=str(uuid.uuid4())
            if user=='alice':db.execute(sql('cancelListingSql'),(request,1001,lot,user,request))
            else:db.execute(sql('fillListingSql'),(request,1001,user,lot,request))
        self.concurrent(worker)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM player_fills').fetchone()[0]+self.db.execute('SELECT COUNT(*) FROM player_cancellations').fetchone()[0],1)
        self.assertEqual(self.food()+self.food('bob'),12)

    def test_two_account_fill_cancel_race_and_reconnect_replay(self):
        lot,_=self.create()
        requests={user:str(uuid.uuid4()) for user in ['alice','bob']}
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'two-account-market.sqlite'
            disk=sqlite3.connect(path);self.db.backup(disk);disk.close()
            barrier=threading.Barrier(2);failures=[];results={}
            def command(connection,user):
                if user=='alice':return connection.execute(sql('cancelListingSql'),(requests[user],1001,lot,user,requests[user])).rowcount
                return connection.execute(sql('fillListingSql'),(requests[user],1001,user,lot,requests[user])).rowcount
            def worker(user):
                connection=sqlite3.connect(path,timeout=10)
                try:
                    barrier.wait(timeout=10)
                    with connection:results[user]=command(connection,user)
                except Exception as error:failures.append(str(error))
                finally:connection.close()
            threads=[threading.Thread(target=worker,args=(user,)) for user in requests]
            for thread in threads:thread.start()
            for thread in threads:thread.join(timeout=15)
            self.assertTrue(all(not thread.is_alive() for thread in threads));self.assertEqual(failures,[])
            self.assertEqual(sum(results.values()),1)
            # New connections represent both clients reconnecting with their original IDs.
            for user in requests:
                with closing(sqlite3.connect(path)) as connection:
                    with connection:self.assertEqual(command(connection,user),0)
            with closing(sqlite3.connect(path)) as connection:
                wallets=dict(connection.execute('SELECT clerk_user_id,balance FROM citizen_wallet_balances'))
                goods=dict(connection.execute("SELECT clerk_user_id,quantity FROM citizen_inventory_balances WHERE item='food'"))
                self.assertEqual(wallets['alice']+wallets['bob'],4000)
                self.assertEqual(goods['alice']+goods['bob'],12)
                self.assertEqual((wallets['alice'],wallets['bob'],goods['alice'],goods['bob']),
                    (2300,1700,4,8) if results['bob'] else (2000,2000,6,6))
                self.assertEqual(connection.execute('SELECT COUNT(*) FROM player_open_lots').fetchone()[0],0)
                self.assertEqual(connection.execute('SELECT COUNT(*) FROM player_fills').fetchone()[0],results['bob'])
                self.assertEqual(connection.execute('SELECT COUNT(*) FROM player_cancellations').fetchone()[0],results['alice'])
                self.assertEqual(connection.execute('SELECT balance FROM merchant_cash_balance').fetchone()[0],10000)
                self.assertEqual(connection.execute('SELECT stock FROM merchant_inventory_balances').fetchone()[0],100)
                # A buyer cannot cancel the owner's separate lot; an owner cannot buy it.
                other=str(uuid.uuid4())
                connection.execute(sql('createListingSql'),(other,'food',1,100,1002,'alice','food',1,other))
                denied=str(uuid.uuid4())
                self.assertEqual(connection.execute(sql('cancelListingSql'),(denied,1003,other,'bob',denied)).rowcount,0)
                self.assertEqual(connection.execute(sql('fillListingSql'),(denied,1003,'alice',other,denied)).rowcount,0)
if __name__=='__main__':unittest.main()
