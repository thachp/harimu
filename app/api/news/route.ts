import {env} from 'cloudflare:workers';
import { flagOn } from '@/lib/flag-pack.mjs'; // #988
import {aiNewsEnabled,prepareAiNews,readAiNews,withAiNews,type NewsAiBinding} from '@/lib/ai-news';
import {aiPathPersonas,aiPersonaMuted,aiTemplatesOnly} from '@/lib/ai-kill-switch';
import {recordKillSwitchChanges} from '@/lib/kill-switch-events';
import {aiBudgetConfig} from '@/lib/ai-budget';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { newsEditionOptions, readNationalNews } from '@/lib/national-news';
import { readCommandObject } from '@/lib/command-request';
import { KINDLE_NEWSPAPERS_FLAG, executeKindleNewspaperCommand, kindleNewspaperFlagOffError, kindleNewspaperNationError, parseKindleNewspaperCommand } from '@/lib/kindle-newspapers'; // #1453
export const dynamic='force-dynamic';
const privateJson=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 const userId=await authenticatedUserId(request);
 if(!userId)return privateJson({error:'Sign in required.'},401);
 const db=await getDatabase();
 const citizen=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>();
 if(!citizen?.nation_id)return privateJson({error:'Choose citizenship before reading national news.'},403);
 // Query parameters, inspected nation and body data cannot select a foreign edition.
 // #981: plan-stat line is Korund-only inside readNationalNews; the flag off omits it and skips the quota read.
 const news=await readNationalNews(db,citizen.nation_id,Date.now(),newsEditionOptions(env,userId)); // #1443, #1453, #1462
 if(news){const bindings=env as unknown as {AI?:NewsAiBinding;HARIMU_AI_NEWS_ENABLED?:string;HARIMU_AI_DAILY_BUDGET_MICRO?:string;HARIMU_AI_GATEWAY_ID?:string;HARIMU_AI_TEMPLATES_ONLY?:string;HARIMU_AI_MUTED_PERSONAS?:string;HARIMU_KILL_SWITCH_EVENTS_ENABLED?:string;HARIMU_AI_SECONDARY_PROVIDER_ENABLED?:string;HARIMU_AI_SECONDARY_PROVIDER_SECRET?:string};await recordKillSwitchChanges(db,bindings,Math.floor(Date.now()/1000));await prepareAiNews(db,news,Math.floor(Date.now()/1000),bindings.AI,{enabled:aiNewsEnabled&&bindings.HARIMU_AI_NEWS_ENABLED==='true',budget:aiBudgetConfig(bindings),killSwitch:bindings,failover:bindings});
  // #742: in templates-only mode no model article is read or shown, and the edition carries the template-mode footer.
  // #764: a muted news desk keeps the deterministic items and shows the persona-muted notice.
  const templated=aiTemplatesOnly(bindings,citizen.nation_id);const edition=withAiNews(news,templated?[]:await readAiNews(db,citizen.nation_id),templated);
  if(aiPersonaMuted(bindings,aiPathPersonas['ai-news'](citizen.nation_id)))edition.personaMuted=true;return privateJson({...edition,reportsEnabled:(env as unknown as {HARIMU_REPORTS_ENABLED?:string}).HARIMU_REPORTS_ENABLED==='true'});}
 return news?privateJson(news):privateJson({error:'Your nation’s news edition is not built yet.'},404);
}
export async function POST(request:Request){
 const userId=await authenticatedUserId(request);
 if(!userId)return privateJson({error:'Sign in required.'},401);
 if(!flagOn(env,KINDLE_NEWSPAPERS_FLAG))return privateJson({error:kindleNewspaperFlagOffError},404);
 let body:Record<string,unknown>;
 try{body=await readCommandObject(request);}catch{return privateJson({error:'Expected a JSON command object.'},400);}
 const parsed=parseKindleNewspaperCommand(body);
 if('error' in parsed)return privateJson({error:parsed.error},400);
 const db=await getDatabase();
 const citizen=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>();
 if(!citizen?.nation_id)return privateJson({error:'Choose citizenship before founding a newspaper or publishing.'},403);
 if(citizen.nation_id!=='kindle')return privateJson({error:kindleNewspaperNationError},403);
 const result=await executeKindleNewspaperCommand(db,userId,parsed.command,Date.now());
 return privateJson(result.status===200?result:{error:result.error},result.status);
}
