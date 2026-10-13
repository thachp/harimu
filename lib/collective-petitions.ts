export const petitionWindowSeconds=7*86400;
export const collectivePetitionSchemas=[
 `CREATE TABLE IF NOT EXISTS civic_human_activity (clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id),last_seen INTEGER NOT NULL,policy TEXT NOT NULL CHECK(policy='tier1-human-v1'))`,
 `CREATE TABLE IF NOT EXISTS civic_petitions (id TEXT PRIMARY KEY,creator_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),nation_id TEXT NOT NULL CHECK(nation_id='kindle'),title TEXT NOT NULL,demand TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,weekly_humans INTEGER NOT NULL CHECK(weekly_humans>0),threshold INTEGER NOT NULL CHECK(threshold>0),reached_at INTEGER,response_text TEXT,response_at INTEGER,CHECK(expires_at=created_at+604800),CHECK(reached_at IS NULL OR (reached_at>=created_at AND reached_at<expires_at)),CHECK((response_text IS NULL AND response_at IS NULL) OR (response_text IS NOT NULL AND response_at IS NOT NULL AND reached_at IS NOT NULL AND response_at>=reached_at)))`,
 `CREATE TABLE IF NOT EXISTS civic_petition_signatures (petition_id TEXT NOT NULL REFERENCES civic_petitions(id),clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),request_id TEXT NOT NULL UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('create','sign')),signed_at INTEGER NOT NULL,policy TEXT NOT NULL CHECK(policy='tier1-human-v1'),PRIMARY KEY(petition_id,clerk_user_id))`,
 `CREATE INDEX IF NOT EXISTS idx_civic_petitions_created ON civic_petitions(created_at)`,
];
export type CollectivePetition={id:string;title:string;demand:string;createdAt:number;expiresAt:number;weeklyHumans:number;threshold:number;signatures:number;signed:boolean;mine:boolean;status:'collecting'|'expired'|'awaiting-response'|'responded';reachedAt:number|null;response:{text:string;at:number}|null};
export type CollectivePetitions={nationId:'kindle';asOf:number;weeklyHumans:number;petitions:CollectivePetition[]};
export function petitionThreshold(weeklyHumans:number){if(!Number.isSafeInteger(weeklyHumans)||weeklyHumans<1)throw Error('Verified weekly population is unavailable.');return Math.ceil(weeklyHumans*3/100);}
export function validPetitionText(value:unknown,min:number,max:number):value is string{return typeof value==='string'&&value===value.trim()&&value.length>=min&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);}
export function validPetitionId(value:unknown):value is string{return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
const weeklyCountSql=`SELECT COUNT(*) AS count FROM civic_human_activity a JOIN citizens c ON c.clerk_user_id=a.clerk_user_id WHERE c.nation_id='kindle' AND a.policy='tier1-human-v1' AND a.last_seen>=? AND a.last_seen<=?`;
/** Only call after fresh trusted Tier-1 evidence. AI/background actors never enter this ledger. */
export async function recordVerifiedHumanVisit(db:D1Database,userId:string,now:number){
 await db.prepare(`INSERT INTO civic_human_activity (clerk_user_id,last_seen,policy) SELECT clerk_user_id,?,'tier1-human-v1' FROM citizens WHERE clerk_user_id=? AND nation_id='kindle' ON CONFLICT(clerk_user_id) DO UPDATE SET last_seen=MAX(last_seen,excluded.last_seen)`).bind(now,userId).run();
}
export async function weeklyHumans(db:D1Database,now:number){return (await db.prepare(weeklyCountSql).bind(now-petitionWindowSeconds,now).first<{count:number}>())?.count??0;}
export const createCollectivePetitionSql=`INSERT INTO civic_petitions (id,creator_id,nation_id,title,demand,created_at,expires_at,weekly_humans,threshold)
 SELECT ?,c.clerk_user_id,'kindle',?,?,?,?+604800,pop.count,CAST((pop.count*3+99)/100 AS INTEGER)
 FROM citizens c CROSS JOIN (SELECT COUNT(*) AS count FROM civic_human_activity a JOIN citizens h ON h.clerk_user_id=a.clerk_user_id WHERE h.nation_id='kindle' AND a.policy='tier1-human-v1' AND a.last_seen>=? AND a.last_seen<=?) pop
 WHERE c.clerk_user_id=? AND c.nation_id='kindle' AND pop.count>0
 AND NOT EXISTS (SELECT 1 FROM civic_petitions WHERE creator_id=c.clerk_user_id AND expires_at>?)
 AND NOT EXISTS (SELECT 1 FROM civic_petition_signatures WHERE request_id=?) ON CONFLICT(id) DO NOTHING`;
export const signCollectivePetitionSql=`INSERT INTO civic_petition_signatures (petition_id,clerk_user_id,request_id,kind,signed_at,policy)
 SELECT p.id,c.clerk_user_id,?,?,?,'tier1-human-v1' FROM civic_petitions p JOIN citizens c ON c.clerk_user_id=?
 WHERE p.id=? AND c.nation_id='kindle' AND p.nation_id='kindle' AND p.reached_at IS NULL AND p.expires_at>? AND p.created_at<=?
 AND (?='sign' OR p.creator_id=c.clerk_user_id) ON CONFLICT DO NOTHING`;
export const latchCollectiveThresholdSql=`UPDATE civic_petitions SET reached_at=? WHERE id=? AND reached_at IS NULL AND created_at<=? AND expires_at>?
 AND (SELECT COUNT(*) FROM civic_petition_signatures s WHERE s.petition_id=civic_petitions.id AND s.policy='tier1-human-v1' AND s.signed_at>=civic_petitions.created_at AND s.signed_at<civic_petitions.expires_at)>=threshold`;
export async function readCollectivePetitions(db:D1Database,userId:string,now:number):Promise<CollectivePetitions>{
 const rows=await db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM civic_petition_signatures s WHERE s.petition_id=p.id AND s.policy='tier1-human-v1' AND s.signed_at>=p.created_at AND s.signed_at<p.expires_at) AS signatures,
 EXISTS(SELECT 1 FROM civic_petition_signatures s WHERE s.petition_id=p.id AND s.clerk_user_id=?) AS signed FROM civic_petitions p WHERE p.nation_id='kindle' ORDER BY p.created_at DESC,p.id LIMIT 50`).bind(userId).all<{id:string;creator_id:string;title:string;demand:string;created_at:number;expires_at:number;weekly_humans:number;threshold:number;signatures:number;signed:number;reached_at:number|null;response_text:string|null;response_at:number|null}>();
 return {nationId:'kindle',asOf:now,weeklyHumans:await weeklyHumans(db,now),petitions:rows.results.map(p=>({id:p.id,title:p.title,demand:p.demand,createdAt:p.created_at,expiresAt:p.expires_at,weeklyHumans:p.weekly_humans,threshold:p.threshold,signatures:p.signatures,signed:Boolean(p.signed),mine:p.creator_id===userId,status:p.response_text!==null?'responded':p.reached_at!==null?'awaiting-response':now>=p.expires_at?'expired':'collecting',reachedAt:p.reached_at,response:p.response_text!==null&&p.response_at!==null?{text:p.response_text,at:p.response_at}:null}))};
}
