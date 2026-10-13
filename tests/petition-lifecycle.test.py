"""Exercise production lifecycle SQL: immutable reviews and atomic resolution."""
import pathlib,re,sqlite3,unittest,json
source=(pathlib.Path(__file__).parents[1]/'lib/government-state.ts').read_text()
def sql(name): return re.search(r'export const '+name+r' = `([^`]+)`',source).group(1)
class LifecycleTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  self.db.executescript("CREATE TABLE citizens(clerk_user_id TEXT PRIMARY KEY,nation_id TEXT); INSERT INTO citizens VALUES ('alice','kindle'),('bob','kindle'),('carl','korund');")
  for name in ['petitionSchema','petitionEligibilitySchema','petitionReviewSchema','petitionResolutionSchema']:self.db.execute(sql(name))
  for request,user,nation,topic in [('a','alice','kindle','work'),('b','bob','kindle','food'),('c','carl','korund','work')]:
   self.db.execute('INSERT INTO government_petitions VALUES (?,?,?,?,?,?)',(request,user,nation,topic,0,100))
   self.db.execute(sql('petitionEligibilitySql'),(100,request,user))
  self.db.commit()
 def review(self,topic='work',day=0,nation='kindle'):
  with self.db:
   self.db.execute(sql('petitionReviewSql'),(nation,day,86400,topic,2,json.dumps({'topic':topic})))
   self.db.execute(sql('petitionResolutionSql'),(nation,day))
 def test_accept_defer_and_nation_isolation(self):
  self.review();self.assertEqual(self.db.execute('SELECT request_id,status FROM government_petition_resolutions ORDER BY request_id').fetchall(),[('a','accepted'),('b','deferred')])
 def test_legacy_and_cross_account_receipts_do_not_resolve(self):
  self.db.execute("DELETE FROM government_petition_eligibility WHERE request_id='a'")
  self.db.execute("UPDATE government_petition_eligibility SET clerk_user_id='alice' WHERE request_id='b'")
  self.review()
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM government_petition_resolutions').fetchone()[0],0)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM government_petitions').fetchone()[0],3)
 def test_replay_preserves_winner_review_and_status(self):
  self.review();self.review('food')
  self.assertEqual(self.db.execute('SELECT selected_topic FROM government_reviews').fetchone()[0],'work')
  self.assertEqual(self.db.execute("SELECT status FROM government_petition_resolutions WHERE request_id='a'").fetchone()[0],'accepted')
 def test_failure_rolls_back_review_and_resolution(self):
  self.db.execute("CREATE TRIGGER fail BEFORE INSERT ON government_petition_resolutions BEGIN SELECT RAISE(ABORT,'fail'); END;")
  with self.assertRaises(sqlite3.IntegrityError):self.review()
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM government_reviews').fetchone()[0],0)
 def test_restart_preserves_resolution(self):
  self.review();dump='\n'.join(self.db.iterdump());self.db.close();self.db=sqlite3.connect(':memory:');self.db.executescript(dump);self.review('food')
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM government_petition_resolutions').fetchone()[0],2)
 def test_day_reviews_do_not_resolve_other_periods(self):
  self.db.execute("INSERT INTO government_petitions VALUES ('next','alice','kindle','food',86400,86500)");self.db.commit();self.review()
  self.assertEqual(self.db.execute("SELECT COUNT(*) FROM government_petition_resolutions WHERE request_id='next'").fetchone()[0],0)
if __name__=='__main__':unittest.main()
