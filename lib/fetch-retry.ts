/** Client-side retry with backoff for idempotent GETs (#52/#56).
 * Retries network failures and 502/503/504/520-524; never retries POSTs.
 * The backoff wait is abortable: aborting rejects at once and clears the timer.
 */
const retryable=new Set([502,503,504,520,521,522,523,524]);
const abortError=()=>new DOMException('Aborted','AbortError');
export function abortableSleep(ms:number,signal?:AbortSignal){
 return new Promise<void>((resolve,reject)=>{
  if(signal?.aborted){reject(abortError());return;}
  const onAbort=()=>{clearTimeout(timer);reject(abortError());};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},ms);
  signal?.addEventListener('abort',onAbort,{once:true});
 });
}
export async function fetchWithRetry(input:string,init:RequestInit&{signal?:AbortSignal}={},{attempts=4,baseMs=500,fetcher=fetch,sleep=abortableSleep}:{attempts?:number;baseMs?:number;fetcher?:typeof fetch;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>}={}):Promise<Response>{
 if(init.method&&init.method.toUpperCase()!=='GET')throw Error('fetchWithRetry only retries GET requests.');
 for(let attempt=0;;attempt++){
  const last=attempt+1>=attempts;
  try{
   const response=await fetcher(input,init);
   if(last||!retryable.has(response.status))return response;
  }catch(error){
   if(init.signal?.aborted||(error as Error)?.name==='AbortError'||last)throw error;
  }
  await sleep(baseMs*2**attempt,init.signal??undefined);
  if(init.signal?.aborted)throw abortError();
 }
}
