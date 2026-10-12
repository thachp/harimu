"""Execute the production petition eligibility and UTC-day cooldown SQL."""
import pathlib,re,sqlite3,unittest,uuid
source=(pathlib.Path(__file__).parents[1]/'lib/government-state.ts').read_text()
def sql(name):return re.search(r'export const '+name+r' = `([^`]+)`',source).group(1)
class PetitionTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.executescript("CREATE TABLE citizens(clerk_user_id TEXT PRIMARY KEY,nation_id TEXT); INSERT INTO citizens VALUES ('alice','kindle'),('bob','korund'),('carl','aurelle'),('visitor',NULL),('other','vespera');")
        self.db.execute(sql('petitionSchema'))
    def petition(self,user='alice',day=0,topic='food',request=None):
        request=request or str(uuid.uuid4())
        with self.db:return self.db.execute(sql('petitionSql'),(request,topic,day,day+100,user,request,user,day)).rowcount
    def test_nation_eligibility(self):
        for user in ['alice','bob','carl']:self.assertEqual(self.petition(user),1)
        for user in ['visitor','other','missing']:self.assertEqual(self.petition(user),0)
    def test_one_per_day_across_topics_and_nation_changes(self):
        self.assertEqual(self.petition(),1);self.assertEqual(self.petition(topic='work'),0)
        self.db.execute("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'");self.db.commit()
        self.assertEqual(self.petition(topic='infrastructure'),0);self.assertEqual(self.petition(day=86400),1)
    def test_request_replay_cross_account_and_restart(self):
        request=str(uuid.uuid4());self.assertEqual(self.petition(request=request),1)
        dump='\n'.join(self.db.iterdump());self.db.close();self.db=sqlite3.connect(':memory:');self.db.executescript(dump)
        self.assertEqual(self.petition(day=86400,request=request),0);self.assertEqual(self.petition('bob',request=request),0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM government_petitions').fetchone()[0],1)
    def test_topic_constraint_and_failure_leave_no_receipt(self):
        with self.assertRaises(sqlite3.IntegrityError):self.petition(topic='invalid')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM government_petitions').fetchone()[0],0)
        self.assertEqual(self.petition(),1)
if __name__=='__main__':unittest.main()
