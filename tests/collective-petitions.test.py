"""Real SQLite statements and integrity constraints; isolated fixture humans only."""
from pathlib import Path
import re
import sqlite3
import unittest

source = Path('lib/collective-petitions.ts').read_text()
schemas = re.findall(r'`(.*?)`', re.search(r'collectivePetitionSchemas=\[(.*?)\];', source, re.S).group(1), re.S)
def sql(name):
    return re.search(r'export const ' + name + r'=`(.*?)`;', source, re.S).group(1)

class Petitions(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.execute('CREATE TABLE citizens(clerk_user_id TEXT PRIMARY KEY,nation_id TEXT)')
        self.db.executemany('INSERT INTO citizens VALUES (?,?)', [('alice','kindle'),('bob','kindle'),('carol','kindle'),('foreign','korund')])
        for statement in schemas:
            self.db.execute(statement)
        self.db.executemany('INSERT INTO citizens VALUES (?,?)', [(f'fixture-human-{i}','kindle') for i in range(97)])
        self.db.execute("INSERT INTO civic_human_activity SELECT clerk_user_id,100,'tier1-human-v1' FROM citizens WHERE nation_id='kindle'")
    def publish(self, pid='p', user='alice'):
        self.db.execute(sql('createCollectivePetitionSql'), (pid,'Waterworks audit','Publish the waterworks audit.',100.0,100.0,-604700.0,100.0,user,100.0,pid))
    def sign(self, user, request, now=101.0, kind='sign'):
        self.db.execute(sql('signCollectivePetitionSql'), (request,kind,now,user,'p',now,now,kind))
    def latch(self, now=101.0):
        self.db.execute(sql('latchCollectiveThresholdSql'), (now,'p',now,now))
    def test_bound_integer_numbers_from_javascript_are_accepted_and_double_signing_is_rejected(self):
        self.publish();self.sign('alice','first',100.0,'create');self.sign('alice','second')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM civic_petition_signatures').fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT threshold,expires_at-created_at FROM civic_petitions').fetchone(),(3,604800))
    def test_three_distinct_humans_latch_threshold_once_and_never_lose_it_after_expiry(self):
        self.publish()
        for user in ('alice','bob','carol'):self.sign(user,user)
        self.latch();self.latch(604900.0)
        self.assertEqual(self.db.execute('SELECT reached_at FROM civic_petitions').fetchone()[0],101)
        self.sign('foreign','foreign')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM civic_petition_signatures').fetchone()[0],3)
    def test_exact_expiry_and_before_creation_cannot_accept_or_latch_signatures(self):
        self.publish();self.sign('alice','early',99.0);self.sign('bob','late',604900.0);self.latch(604900.0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM civic_petition_signatures').fetchone()[0],0)
        self.assertIsNone(self.db.execute('SELECT reached_at FROM civic_petitions').fetchone()[0])
    def test_foreign_publication_and_duplicate_active_publication_fail_without_replacing_record(self):
        self.publish(user='foreign');self.assertEqual(self.db.execute('SELECT COUNT(*) FROM civic_petitions').fetchone()[0],0)
        self.publish();self.publish(pid='second');self.sign('bob','forged-create',kind='create')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM civic_petitions').fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM civic_petition_signatures').fetchone()[0],0)
    def test_response_constraints_prevent_unreached_or_inconsistent_records(self):
        self.publish()
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE civic_petitions SET response_text='Unrecorded promise',response_at=101")
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE civic_petitions SET expires_at=123')
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE civic_petitions SET threshold=0')

if __name__ == '__main__':
    unittest.main()
