import pathlib,re,sqlite3,tempfile,unittest,concurrent.futures
SOURCE=(pathlib.Path(__file__).resolve().parents[1]/'lib/square-chat.ts').read_text()
SCHEMAS=re.findall(r'`(CREATE [^`]+)`',SOURCE)
POST=re.search(r'export const postSquareSql = `([^`]+)`',SOURCE).group(1)
class SquareTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.path=self.tmp.name+'/square.db';self.db=sqlite3.connect(self.path)
  self.db.execute('CREATE TABLE citizens(clerk_user_id TEXT PRIMARY KEY,nation_id TEXT)')
  self.db.executemany('INSERT INTO citizens VALUES (?,?)',[('alice','kindle'),('bob','kindle'),('carl','korund'),('visitor',None)])
  for schema in SCHEMAS:self.db.execute(schema)
  self.db.executemany('INSERT INTO square_handles VALUES (?,?)',[('alice','Citizen-one'),('bob','Citizen-two'),('carl','Citizen-three')]);self.db.commit()
 def tearDown(self):self.db.close();self.tmp.cleanup()
 def post(self,id,user='alice',now=10000,body='hello',db=None):
  connection=db or self.db;count=connection.execute(POST,(id,body,now,user,id,user,now-10,user,now-3600)).rowcount;connection.commit();return count
 def test_rate_boundary_and_deleted_messages_count(self):
  self.assertEqual(self.post('one'),1);self.assertEqual(self.post('two',now=10009),0)
  self.db.execute("UPDATE square_messages SET deleted=1,body='[removed]' WHERE id='one'")
  self.assertEqual(self.post('three',now=10010),1)
 def test_hour_limit_and_boundary(self):
  for n in range(20):self.assertEqual(self.post(str(n),now=10000+n*10),1)
  self.assertEqual(self.post('blocked',now=10300),0);self.assertEqual(self.post('later',now=13600),1)
 def test_idempotency_no_duplicate_debits_or_rows(self):
  self.assertEqual(self.post('one'),1);self.assertEqual(self.post('one',now=10010),0);self.assertEqual(self.post('one','bob'),0)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM square_messages').fetchone()[0],1)
 def test_requires_enrollment_and_server_nation(self):
  self.assertEqual(self.post('visitor','visitor'),0);self.assertEqual(self.post('unknown','unknown'),0)
  self.post('carl','carl');self.assertEqual(self.db.execute('SELECT nation_id FROM square_messages').fetchone()[0],'korund')
 def test_delete_ownership(self):
  self.post('one');self.assertEqual(self.db.execute("UPDATE square_messages SET deleted=1 WHERE id='one' AND user_id='bob'").rowcount,0)
  self.assertEqual(self.db.execute("UPDATE square_messages SET deleted=1 WHERE id='one' AND user_id='alice'").rowcount,1)
 def test_concurrent_posts_respect_interval(self):
  def worker(id):
   db=sqlite3.connect(self.path,timeout=5)
   try:return self.post(id,db=db)
   finally:db.close()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(worker,['one','two']))
  self.assertEqual(sum(results),1)
 def test_concurrent_same_id_and_two_account_isolation(self):
  def worker(user):
   db=sqlite3.connect(self.path,timeout=5)
   try:return self.post('same',user,db=db)
   finally:db.close()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(worker,['alice','bob']))
  self.assertEqual(sum(results),1)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM square_messages').fetchone()[0],1)
 def test_feed_privacy_and_nation_isolation(self):
  self.post('one','alice');self.post('two','carl')
  query=re.search(r'`(SELECT m.id,h.handle,m.body,m.posted_at[^`]+)`',SOURCE).group(1)
  rows=self.db.execute(query,('kindle',0,'bob','kindle')).fetchall()
  self.assertEqual(rows,[('one','Citizen-one','hello',10000)])
  self.assertEqual(self.db.execute(query,('kindle',0,'carl','kindle')).fetchall(),[])
 def test_retention_cleanup_and_presence_expiry(self):
  self.post('old',now=1000);self.post('new',now=605801)
  self.db.execute('DELETE FROM square_messages WHERE posted_at<=?',(605801-604800,))
  self.assertEqual(self.db.execute('SELECT id FROM square_messages').fetchall(),[('new',)])
  self.db.execute("INSERT INTO square_presence VALUES ('alice','kindle',1090)")
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM square_presence WHERE expires_at>?',(1089,)).fetchone()[0],1)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM square_presence WHERE expires_at>?',(1090,)).fetchone()[0],0)
 def test_presence_must_match_current_nation(self):
  self.db.execute("INSERT INTO square_presence VALUES ('alice','kindle',1090)");self.db.execute("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'")
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM square_presence p JOIN citizens c ON c.clerk_user_id=p.user_id AND c.nation_id=p.nation_id WHERE p.expires_at>1000').fetchone()[0],0)
if __name__=='__main__':unittest.main()
