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
 const news=await readNationalNews(db,citizen.nation_id,Date.now());
 return news?privateJson(news):privateJson({error:'Your nation’s news edition is not built yet.'},404);
}
