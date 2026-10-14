/** Per-isolate memo for expensive PostgreSQL readiness work (#52).
 * The task receives the current request's inputs on every call (no closure over
 * a past request's env/bindings). Only a completed success is remembered, per
 * key, until `ttlMs` elapses; pending work is never shared across requests, and
 * failures are not cached, so the next request retries with its own inputs.
 */
export function isolateOnce<A extends unknown[]>(task:(...args:A)=>Promise<void>,ttlMs=Infinity,now:()=>number=Date.now){
 const succeeded=new Map<string,number>();
 return async(key:string,...args:A)=>{
  const at=succeeded.get(key);
  if(at!==undefined&&now()-at<ttlMs)return;
  await task(...args);succeeded.set(key,now());
 };
}

/** Bounded connect with an overall budget: every attempt's timeout is capped by
 * the time left in `budgetMs`, so connect plus retry never exceeds the budget.
 * `open` receives the per-attempt timeout to pass to the driver.
 */
export async function connectWithRetry<T>(open:(timeoutMs:number)=>Promise<T>,{attempts=2,budgetMs=3000,backoffMs=100,now=Date.now,sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))}:{attempts?:number;budgetMs?:number;backoffMs?:number;now?:()=>number;sleep?:(ms:number)=>Promise<void>}={}){
 const deadline=now()+budgetMs;let last:unknown=Error('PostgreSQL connection budget exhausted.');
 for(let attempt=0;attempt<attempts;attempt++){
  const remaining=deadline-now();if(remaining<=0)break;
  try{return await open(Math.max(1,Math.ceil(remaining/(attempts-attempt))));}catch(error){last=error;}
  if(attempt+1<attempts){const pause=Math.min(backoffMs,deadline-now());if(pause<=0)break;await sleep(pause);}
 }
 throw last;
}
