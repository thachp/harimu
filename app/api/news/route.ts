import {env} from 'cloudflare:workers';
import {aiNewsEnabled,prepareAiNews,readAiNews,type NewsAiBinding} from '@/lib/ai-news';
import {aiBudgetConfig} from '@/lib/ai-budget';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readNationalNews } from '@/lib/national-news';
export const dynamic='force-dynamic';
const privateJson=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 const userId=await authenticatedUserId(request);
 if(!userId)return privateJson({error:'Sign in required.'},401);
 const db=await getDatabase();
 const citizen=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>();
 if(!citizen?.nation_id)return privateJson({error:'Choose citizenship before reading national news.'},403);
 // Query parameters, inspected nation and body data cannot select a foreign edition.
 const news=await readNationalNews(db,citizen.nation_id,Date.now(),{korundPresidium:(env as unknown as {HARIMU_KORUND_PRESIDIUM_ENABLED?:string}).HARIMU_KORUND_PRESIDIUM_ENABLED==='true',war:(env as unknown as {HARIMU_WAR_ENABLED?:string}).HARIMU_WAR_ENABLED==='true',diplomacy:(env as unknown as {HARIMU_DIPLOMACY_ENABLED?:string}).HARIMU_DIPLOMACY_ENABLED==='true',faith:(env as unknown as {HARIMU_FAITH_ENABLED?:string}).HARIMU_FAITH_ENABLED==='true'});
 if(news){const bindings=env as unknown as {AI?:NewsAiBinding;HARIMU_AI_NEWS_ENABLED?:string;HARIMU_AI_DAILY_BUDGET_MICRO?:string;HARIMU_AI_GATEWAY_ID?:string};await prepareAiNews(db,news,Math.floor(Date.now()/1000),bindings.AI,{enabled:aiNewsEnabled&&bindings.HARIMU_AI_NEWS_ENABLED==='true',budget:aiBudgetConfig(bindings)});news.items=[...await readAiNews(db,citizen.nation_id),...news.items].sort((a,b)=>b.occurredAt-a.occurredAt).slice(0,12);}
 return news?privateJson(news):privateJson({error:'Your nation’s news edition is not built yet.'},404);
}
