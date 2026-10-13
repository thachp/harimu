import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
test('post and delete require the conversation nation; a stale draft never enters the new nation',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const id=randomUUID(),post={action:'post',id,text:'Fixture draft from Kindle',expectedNationId:'kindle'};
 assert.equal((await r.call('square','alice',{action:'post',id,text:post.text})).status,400);
 assert.equal((await r.call('square','alice',post)).status,200);
 await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
 const stale=await r.call('square','alice',{...post,id:randomUUID()});assert.equal(stale.status,409);assert.match(stale.data.error,/Citizenship changed/);
 assert.equal((await r.call('square','alice',{action:'delete',id,expectedNationId:'kindle'})).status,409);
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM square_messages').first()).n,1);assert.equal((await r.db.prepare('SELECT deleted FROM square_messages WHERE id=?').bind(id).first()).deleted,0);
 assert.equal((await r.call('square','alice',{...post,id:randomUUID(),expectedNationId:'korund'})).status,429); // rate limit survives the nation change
});
test('a citizenship change between context read and insert is refused atomically',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const prepare=r.db.prepare.bind(r.db);let switched=false;
 r.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('INSERT INTO square_messages')){const bind=statement.bind.bind(statement);statement.bind=(...params)=>{const bound=bind(...params),run=bound.run.bind(bound);bound.run=async()=>{if(!switched){switched=true;await prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();}return run();};return bound;};}return statement;};
 const result=await r.call('square','alice',{action:'post',id:randomUUID(),text:'Fixture race draft',expectedNationId:'kindle'});assert.equal(result.status,409);assert.equal(switched,true);assert.equal((await prepare('SELECT COUNT(*) AS n FROM square_messages').first()).n,0);
});
test('a citizenship change between context read and deletion cannot remove an old-nation message',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const id=randomUUID();await r.call('square','alice',{action:'post',id,text:'Fixture saved draft',expectedNationId:'kindle'});
 const prepare=r.db.prepare.bind(r.db);r.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('UPDATE square_messages SET deleted')){const bind=statement.bind.bind(statement);statement.bind=(...params)=>{const bound=bind(...params),run=bound.run.bind(bound);bound.run=async()=>{await prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();return run();};return bound;};}return statement;};
 assert.equal((await r.call('square','alice',{action:'delete',id,expectedNationId:'kindle'})).status,404);assert.equal((await prepare('SELECT deleted FROM square_messages WHERE id=?').bind(id).first()).deleted,0);
});
