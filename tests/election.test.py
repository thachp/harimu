"""Isolated SQL privacy structure, deduplication and exact ballot-window guards."""
from pathlib import Path
import json
import re
import sqlite3
import unittest
source=Path('lib/elections.ts').read_text()
schemas=re.findall(r'`(.*?)`',re.search(r'electionSchemas=\[(.*?)\];',source,re.S).group(1),re.S)
def sql(name):return re.search(r'export const '+name+r'=`(.*?)`;',source,re.S).group(1)
class Elections(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON');self.db.execute('CREATE TABLE citizens(clerk_user_id TEXT PRIMARY KEY,nation_id TEXT)')
  self.db.executemany('INSERT INTO citizens VALUES (?,?)',[('alice','kindle'),('bob','kindle'),('foreign','korund')])
  for statement in schemas:self.db.execute(statement)
  self.db.execute("INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at) VALUES ('e','kindle',?,100,259300)",(json.dumps([{'id':'ines'},{'id':'tobin'},{'id':'mara'}]),))
 def vote(self,user='alice',request='receipt',ballot='random-independent-ballot',now=101.0):
  self.db.execute(sql('voteReceiptSql'),(request,now,user,'e',now,now));self.db.execute(sql('anonymousBallotSql'),(ballot,json.dumps(['ines','tobin','mara']),request,user,'e'));self.db.execute(sql('markBallotWrittenSql'),(request,user,'e'))
 def test_no_identity_receipt_time_or_rowid_is_stored_with_a_ranking(self):
  self.vote();columns={row[1] for row in self.db.execute('PRAGMA table_info(civic_anonymous_ballots)')};self.assertEqual(columns,{'id','election_id','ranking_json','policy'})
  receipt_columns={row[1] for row in self.db.execute('PRAGMA table_info(civic_voter_receipts)')};self.assertNotIn('ranking_json',receipt_columns);self.assertNotIn('ballot_id',receipt_columns)
  with self.assertRaises(sqlite3.OperationalError):self.db.execute('SELECT rowid FROM civic_anonymous_ballots')
  self.assertNotEqual(self.db.execute('SELECT id FROM civic_anonymous_ballots').fetchone()[0],self.db.execute('SELECT request_id FROM civic_voter_receipts').fetchone()[0])
 def test_replay_and_second_receipt_cannot_insert_more_rankings(self):
  self.vote();self.vote(ballot='another-unassociated-id');self.vote(request='second-receipt',ballot='third-unassociated-id')
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM civic_anonymous_ballots').fetchone()[0],1);self.assertEqual(self.db.execute('SELECT COUNT(*) FROM civic_voter_receipts').fetchone()[0],1)
 def test_foreign_and_exact_deadline_votes_are_rejected(self):
  self.vote(user='foreign');self.vote(now=259300.0);self.vote(now=99.0)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM civic_anonymous_ballots').fetchone()[0],0);self.assertEqual(self.db.execute('SELECT COUNT(*) FROM civic_voter_receipts').fetchone()[0],0)
 def test_closed_flag_prevents_reopening_on_a_reversed_clock(self):
  self.db.execute('UPDATE civic_elections SET closed_at=259300');self.vote(now=101.0);self.assertEqual(self.db.execute('SELECT COUNT(*) FROM civic_anonymous_ballots').fetchone()[0],0)
 def test_close_and_result_integrity_guards(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE civic_elections SET closed_at=99')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE civic_elections SET result_json='{}'")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE civic_elections SET closes_at=123')
if __name__=='__main__':unittest.main()
