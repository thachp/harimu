/** #1465: Kindle newspaper writer in NewsDialog; flags.kindleNewspapers only while on. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {test} from 'node:test';
import {localRuntime} from './helpers/local-runtime.mjs';

const FLAG='HARIMU_KINDLE_NEWSPAPERS_ENABLED';
const citizenAt=(r,name='kay')=>{
  const at=new Date(r.now).toISOString();
  return r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(name,name,at,at).run();
};

for (const backend of ['sqlite','postgres']) test(`#1465 GET /api/citizen: flags.kindleNewspapers appears only while the newspapers flag is on (${backend})`, async t => {
  const r=await localRuntime({backend}); t.after(()=>r.close());
  await citizenAt(r);
  const off=(await r.call('citizen','kay')).data;
  assert.equal('kindleNewspapers' in off.flags,false);
  r.setFixtureEnv(FLAG,'true');
  const on=(await r.call('citizen','kay')).data;
  assert.equal(on.flags.kindleNewspapers,true);
  const onFlags={...on.flags}; delete onFlags.kindleNewspapers;
  assert.deepEqual(onFlags,off.flags);
  assert.deepEqual(Object.keys(on).sort(),Object.keys(off).sort());
  r.setFixtureEnv(FLAG,'false');
  const offAgain=(await r.call('citizen','kay')).data;
  assert.equal('kindleNewspapers' in offAgain.flags,false);
});

test('#1465 page and dock wiring: the packed flag is read from the snapshot and defaults to off', async () => {
  const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
  const dock=readFileSync(new URL('../app/citizen-dock.tsx',import.meta.url),'utf8');
  const news=readFileSync(new URL('../app/national-news.tsx',import.meta.url),'utf8');
  const route=readFileSync(new URL('../app/api/citizen/route.ts',import.meta.url),'utf8');
  assert.match(page,/const \[kindleNewspapersFlag, setKindleNewspapersFlag\] = useState\(false\)/);
  assert.match(page,/setKindleNewspapersFlag\(snapshot\.flags\.kindleNewspapers === true\)/);
  assert.match(page,/kindleNewspapers=\{kindleNewspapersFlag\}/);
  assert.match(dock,/kindleNewspapers=false/);
  assert.match(dock,/kindleNewspapers=\{kindleNewspapers\}/);
  assert.match(news,/kindleNewspapers&&nationId==='kindle'/);
  assert.match(news,/from '\.\.\/lib\/kindle-newspapers'/);
  assert.match(route,/\.\.\.\(flagOn\(env, KINDLE_NEWSPAPERS_FLAG\) \? \{ kindleNewspapers: true \} : \{\}\)/);
});

const mutate=(file,find,replace)=>{
  const original=readFileSync(file,'utf8');
  const next=original.replace(find,replace);
  assert.notEqual(next,original,`mutant did not apply in ${file}: ${find}`);
  writeFileSync(file,next);
  return ()=>writeFileSync(file,original);
};

const run= (files, pattern) => {
  const env={...process.env};
  delete env.NODE_TEST_CONTEXT;
  return spawnSync('node',['--experimental-strip-types','--test','--test-concurrency=1','--test-name-pattern',pattern,...files],{encoding:'utf8',cwd:new URL('..',import.meta.url).pathname,env});
};

test('#1465 mutations: showing the writer while off, skipping requestId reuse, dropping errors, and always packing the citizen flag all fail',()=>{
  const ui='tests/national-news-ui.test.mjs';
  const flags='tests/kindle-news-writer-1465.test.mjs';
  const cases=[
    {file:'app/national-news.tsx',find:"kindleNewspapers&&nationId==='kindle'",replace:"nationId==='kindle'",files:[ui],pattern:'#1465 writer is hidden'},
    {file:'app/national-news.tsx',find:"kindleNewspapers&&nationId==='kindle'",replace:'kindleNewspapers',files:[ui],pattern:'#1465 writer is hidden'},
    {file:'app/national-news.tsx',find:'foundIntent&&foundIntent.name===trimmed?foundIntent.requestId:crypto.randomUUID()',replace:'crypto.randomUUID()',files:[ui],pattern:'#1465 found then publish'},
    {file:'app/national-news.tsx',find:'publishIntent&&publishIntent.key===key?publishIntent.requestId:crypto.randomUUID()',replace:'crypto.randomUUID()',files:[ui],pattern:'#1465 found then publish'},
    {file:'app/national-news.tsx',find:"const reason=res.data.error??'The newspaper could not be founded.';",replace:"const reason='The newspaper could not be founded.';",files:[ui],pattern:'#1465 the writer shows the server'},
    {file:'app/national-news.tsx',find:"setError(res.data.error??'The article could not be published.');",replace:"setError('The article could not be published.');",files:[ui],pattern:'#1465 the writer shows the server'},
    {file:'app/api/citizen/route.ts',find:'...(flagOn(env, KINDLE_NEWSPAPERS_FLAG) ? { kindleNewspapers: true } : {})',replace:'...({ kindleNewspapers: true })',files:[flags],pattern:'#1465 GET /api/citizen'},
  ];
  for(const c of cases){
    const restore=mutate(c.file,c.find,c.replace);
    try{
      const result=run(c.files,c.pattern);
      assert.notEqual(result.status,0,`mutant survived (${c.find} -> ${c.replace}):\n${result.stdout}\n${result.stderr}`);
    }finally{restore();}
  }
});
