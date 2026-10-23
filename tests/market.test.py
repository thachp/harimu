"""Exercise the actual market SQL, balance views and meal transaction."""
import json
import pathlib
import re
import sqlite3
import tempfile
import threading
import unittest
import uuid

root = pathlib.Path(__file__).parents[1]
source = ''.join((root / 'lib' / path).read_text() for path in ['market.ts', 'market-orders.ts', 'economy.ts', 'tessera-exchange.ts', 'work-shifts.ts', 'player-market.ts', 'world-simulation.ts'])
def sql(name):
    return re.search(r'export const ' + name + r' = `([^`]+)`', source).group(1)

class MarketTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''CREATE TABLE citizens (clerk_user_id TEXT PRIMARY KEY,
          nation_id TEXT, capacity INTEGER, updated_at TEXT);
          CREATE TABLE work_orders(id TEXT PRIMARY KEY);
          CREATE TABLE work_contributions(clerk_user_id TEXT, work_order_id TEXT, capacity_spent INTEGER, created_at TEXT);
          INSERT INTO citizens VALUES ('alice','kindle',18,''),('bob','kindle',18,''),('carl','korund',18,''),('visitor',NULL,18,'');
          INSERT INTO work_orders VALUES ('harvest');''')
        for name in ['worldClockSchema','worldTickSchema','worldSupplySchema','policyExecutionSchema','shiftSchema','activeShiftIndex','economySchema','recoverySchema','rewardSchema','fundSchema','incomeTaxSchema','tesseraExchangeSchema',
                     'marketItemsSchema','starterSchema','marketEventsSchema','listingSchema','fillSchema','cancelSchema','playerReceiptView','openLotsView','marketGoodsSchema','marketOrdersSchema','marketCancellationsSchema','marketTradesSchema','marketSpoilageSchema','marketOpenOrdersView','marketTradeFeesSchema','marketTradeFeesIndex','homeCityMovesSchema','walletViewSql','inventoryViewSql','merchantViewSql','merchantCashSql']:
            self.db.execute(sql(name))
        self.db.execute("INSERT INTO economy_funds VALUES ('kindle-merchant',10000)")
        self.db.execute("INSERT INTO market_items VALUES ('food','Food',150,100,100)")
        for user in ['alice','bob']:
            self.db.execute('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)',
              (user,user,'harvest','Harvest','Food',4,'','','done'))
            self.db.execute('INSERT INTO shift_settlements VALUES (?,?,?,?,?,?)',(user,user,2000,'food',4,''))
            self.db.execute(sql('starterGrantSql'),(user,))
        self.db.commit()

    def balance(self,user='alice'):
        return self.db.execute('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?',(user,)).fetchone()[0]
    def food(self,user='alice'):
        row=self.db.execute("SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id=? AND item='food'",(user,)).fetchone()
        return row[0] if row else 0
    def trade_params(self, id, side='buy', quantity=1, user='alice', item='food'):
        return (id,side,side,quantity,quantity,side,quantity,quantity,1000,item,user,quantity,quantity,quantity,id,side,quantity,quantity,side,quantity,quantity)
    def trade(self,side='buy',quantity=1,user='alice',id=None,item='food'):
        with self.db:
            return self.db.execute(sql('tradeSql'),self.trade_params(id or str(uuid.uuid4()),side,quantity,user,item)).rowcount
    def meal(self,id=None,user='alice',now=1000,fail=False):
        id=id or str(uuid.uuid4())
        with self.db:
            count=self.db.execute(sql('mealSql'),(id,now,user,id,now,86400)).rowcount
            self.db.execute(sql('mealCapacitySql'),(user,id,user))
            if fail:self.db.execute('UPDATE missing SET id=0')
            self.db.execute(sql('mealAppliedSql'),(id,user))
        return count

    def test_buy_sell_transfer_both_balances_and_conserve_cash_stock(self):
        self.assertEqual(self.trade('buy',2),1)
        self.assertEqual((self.balance(),self.food()),(1700,8))
        self.assertEqual(self.trade('sell',2),1)
        self.assertEqual((self.balance(),self.food()),(1900,6))
        cash=self.db.execute('SELECT balance FROM merchant_cash_balance').fetchone()[0]
        stock=self.db.execute("SELECT stock FROM merchant_inventory_balances WHERE item='food'").fetchone()[0]
        self.assertEqual(self.balance()+self.balance('bob')+cash,14000)
        self.assertEqual(self.food()+self.food('bob')+stock,112)

    def test_integral_real_parameters_trade_and_fractional_parameters_fail_closed(self):
        self.assertEqual(self.trade(quantity=1.0),1)
        self.assertEqual(self.trade(quantity=1.5),0)
        self.assertEqual((self.balance(),self.food()),(1850,7))

    def test_insufficient_wallet_and_stock(self):
        self.db.execute("UPDATE market_items SET buy_minor=100000");self.db.commit()
        self.assertEqual(self.trade(),0)
        self.db.execute("UPDATE market_items SET buy_minor=150,initial_stock=0");self.db.commit()
        self.assertEqual(self.trade(),0)
        self.assertEqual((self.balance(),self.food()),(2000,6))

    def test_insufficient_owned_goods_or_merchant_money(self):
        self.assertEqual(self.trade('sell',7),0)
        self.db.execute("UPDATE economy_funds SET initial_minor=0");self.db.commit()
        self.assertEqual(self.trade('sell',1),0)
        self.assertEqual((self.balance(),self.food()),(2000,6))

    def test_same_id_after_restart_credits_once(self):
        id=str(uuid.uuid4());self.trade(id=id)
        dump='\n'.join(self.db.iterdump())
        self.db.close();self.db=sqlite3.connect(':memory:');self.db.executescript(dump)
        self.assertEqual(self.trade(id=id),0)
        self.assertEqual((self.balance(),self.food()),(1850,7))

    def test_cross_account_replay_and_nation_denial(self):
        id=str(uuid.uuid4());self.trade(id=id)
        self.assertEqual(self.trade(user='bob',id=id),0)
        self.assertEqual((self.balance('bob'),self.food('bob')),(2000,6))
        for user in ['carl','visitor','missing']:
            self.assertEqual(self.trade(user=user),0)
            self.assertEqual(self.meal(user=user),0)

    def test_malformed_amounts_and_unknown_goods(self):
        for quantity in [0,-1,1.5,11]:self.assertEqual(self.trade(quantity=quantity),0)
        self.assertEqual(self.trade(item='weapon'),0)
        self.assertEqual((self.balance(),self.food()),(2000,6))

    def test_database_failure_leaves_all_trade_balances_unchanged(self):
        self.db.executescript("CREATE TRIGGER fail_trade BEFORE INSERT ON citizen_economy_events BEGIN SELECT RAISE(ABORT,'storage failure'); END;")
        with self.assertRaises(sqlite3.IntegrityError):self.trade()
        self.assertEqual((self.balance(),self.food()),(2000,6))
        self.assertEqual(self.db.execute('SELECT balance FROM merchant_cash_balance').fetchone()[0],10000)
        self.assertEqual(self.db.execute('SELECT stock FROM merchant_inventory_balances').fetchone()[0],100)

    def test_meal_once_cooldown_and_no_duplicate_bonus(self):
        id=str(uuid.uuid4());self.assertEqual(self.meal(id),1)
        self.assertEqual(self.food(),4)
        self.assertEqual(self.db.execute("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").fetchone()[0],22)
        self.db.execute("UPDATE citizens SET capacity=18 WHERE clerk_user_id='alice'");self.db.commit()
        self.assertEqual(self.meal(id),0)
        self.assertEqual(self.meal(now=1000+86399),0)
        self.assertEqual(self.db.execute("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").fetchone()[0],18)
        self.assertEqual(self.meal(now=1000+86400),1)
        self.assertEqual(self.food(),2)

    def test_full_capacity_and_missing_food_prevent_waste(self):
        self.db.execute("UPDATE citizens SET capacity=24 WHERE clerk_user_id='alice'");self.db.commit()
        self.assertEqual(self.meal(),0);self.assertEqual(self.food(),6)
        self.trade('sell',6,user='bob');self.assertEqual(self.meal(user='bob'),0)

    def test_meal_rollback_restores_food_capacity_and_retry(self):
        id=str(uuid.uuid4())
        with self.assertRaises(sqlite3.OperationalError):self.meal(id,fail=True)
        self.assertEqual(self.food(),6)
        self.assertEqual(self.db.execute("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").fetchone()[0],18)
        self.assertEqual(self.meal(id),1);self.assertEqual(self.food(),4)

    def test_starter_food_never_repeats_after_switching_nation(self):
        for nation in ['korund','kindle','kindle']:
            self.db.execute("UPDATE citizens SET nation_id=? WHERE clerk_user_id='alice'",(nation,))
            self.db.execute(sql('starterGrantSql'),('alice',))
        self.assertEqual(self.food(),6)

    def test_snapshot_accounts_for_market_and_consumption(self):
        self.trade('sell',1);self.meal()
        wallet,inventory,_=self.db.execute(sql('economySnapshotSql'),('alice','alice','alice')).fetchone()
        self.assertEqual(wallet,2100)
        self.assertEqual(json.loads(inventory),[{'item':'food','quantity':3}])

    def concurrent(self,worker):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'market.sqlite'
            disk=sqlite3.connect(path);self.db.backup(disk);disk.close()
            barrier=threading.Barrier(2);failures=[]
            def run(user):
                connection=sqlite3.connect(path,timeout=10)
                try:
                    barrier.wait();connection.execute('BEGIN IMMEDIATE');worker(connection,user);connection.commit()
                except Exception as error:failures.append(str(error))
                finally:connection.close()
            threads=[threading.Thread(target=run,args=(user,)) for user in ['alice','bob']]
            for thread in threads:thread.start()
            for thread in threads:thread.join()
            self.assertEqual(failures,[])
            disk=sqlite3.connect(path);copy='\n'.join(disk.iterdump());disk.close()
            self.db.close();self.db=sqlite3.connect(':memory:');self.db.executescript(copy)

    def test_concurrent_buyers_cannot_take_last_good_twice(self):
        self.db.execute('UPDATE market_items SET initial_stock=1');self.db.commit()
        self.concurrent(lambda db,user: db.execute(sql('tradeSql'),self.trade_params(str(uuid.uuid4()),user=user)))
        self.assertEqual(self.db.execute('SELECT stock FROM merchant_inventory_balances').fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM citizen_economy_events').fetchone()[0],1)

    def test_concurrent_same_meal_id_applies_bonus_once(self):
        id=str(uuid.uuid4())
        def worker(db,_):
            db.execute(sql('mealSql'),(id,1000,'alice',id,1000,86400))
            db.execute(sql('mealCapacitySql'),('alice',id,'alice'))
            db.execute(sql('mealAppliedSql'),(id,'alice'))
        self.concurrent(worker)
        self.assertEqual(self.food(),4)
        self.assertEqual(self.db.execute("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").fetchone()[0],22)

if __name__ == '__main__':unittest.main()
