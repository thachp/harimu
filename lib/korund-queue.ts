import type {GameDatabase} from './database-contract';
export const korundQueueSchemas=[
 `CREATE TABLE IF NOT EXISTS korund_ration_queue (seq INTEGER PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),game_week INTEGER NOT NULL CHECK(game_week>=1),joined_at INTEGER NOT NULL,expires_at INTEGER NOT NULL CHECK(expires_at>joined_at),status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','cancelled','redeemed')))`,
 `CREATE UNIQUE INDEX IF NOT EXISTS idx_korund_queue_waiting ON korund_ration_queue(clerk_user_id,game_week) WHERE status='waiting'`,
 `CREATE TABLE IF NOT EXISTS korund_queue_cancellations (request_id TEXT PRIMARY KEY,queue_id TEXT NOT NULL REFERENCES korund_ration_queue(request_id),clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),cancelled_at INTEGER NOT NULL)`,
] as const;
// Only current citizens with an unused current-week coupon participate in FIFO.
export const activeRationQueue=`q.status='waiting' AND q.game_week=? AND q.expires_at>? AND EXISTS(SELECT 1 FROM citizens c WHERE c.clerk_user_id=q.clerk_user_id AND c.nation_id='korund') AND NOT EXISTS(SELECT 1 FROM korund_rations r WHERE r.clerk_user_id=q.clerk_user_id AND r.game_week=q.game_week)`;
export type RationQueue={waiting:number;requestId:string|null;position:number|null};
export async function readRationQueue(db:GameDatabase,userId:string,gameWeek:number,now:number):Promise<RationQueue>{
 const row=await db.prepare(`SELECT COUNT(*) AS waiting,MIN(CASE WHEN q.clerk_user_id=? THEN q.seq ELSE NULL END) AS own_seq FROM korund_ration_queue q WHERE ${activeRationQueue}`).bind(userId,gameWeek,now).first<{waiting:number;own_seq:number|null}>();
 if(row?.own_seq==null)return {waiting:row?.waiting??0,requestId:null,position:null};
 const own=await db.prepare(`SELECT request_id,(SELECT COUNT(*) FROM korund_ration_queue q WHERE ${activeRationQueue} AND q.seq<=?) AS position FROM korund_ration_queue WHERE seq=? AND clerk_user_id=?`).bind(gameWeek,now,row.own_seq,row.own_seq,userId).first<{request_id:string;position:number}>();
 return {waiting:row.waiting,requestId:own?.request_id??null,position:own?.position??null};
}
export async function queueIdentifierUsed(db:GameDatabase,id:string){return Boolean(await db.prepare('SELECT request_id FROM korund_ration_queue WHERE request_id=? UNION ALL SELECT request_id FROM korund_queue_cancellations WHERE request_id=?').bind(id,id).first());}
export async function executeRationQueue(db:GameDatabase,userId:string,action:'korund-join-ration-queue'|'korund-cancel-ration-queue',id:string,queueId:string|undefined,gameWeek:number,now:number,expiresAt:number){
 const previous=await db.prepare('SELECT clerk_user_id FROM korund_ration_queue WHERE request_id=?').bind(id).first<{clerk_user_id:string}>();
 const cancellation=await db.prepare('SELECT clerk_user_id,queue_id FROM korund_queue_cancellations WHERE request_id=?').bind(id).first<{clerk_user_id:string;queue_id:string}>();
 if(previous||cancellation){const same=action==='korund-join-ration-queue'?previous?.clerk_user_id===userId&&!cancellation:cancellation?.clerk_user_id===userId&&cancellation.queue_id===queueId&&!previous;return same?{status:200,replayed:true}:{status:409,error:'Request identifier already used.'};}
 const other=await db.prepare('SELECT id FROM korund_rations WHERE id=? UNION ALL SELECT id FROM korund_meals WHERE id=? UNION ALL SELECT id FROM work_shifts WHERE id=?').bind(id,id,id).first();
 if(other)return {status:409,error:'Request identifier already used for another action.'};
 if(action==='korund-join-ration-queue'){
  await db.prepare(`INSERT OR IGNORE INTO korund_ration_queue(seq,request_id,clerk_user_id,game_week,joined_at,expires_at,status) SELECT (SELECT COALESCE(MAX(seq),0)+1 FROM korund_ration_queue),?,clerk_user_id,?,?,?,'waiting' FROM citizens WHERE clerk_user_id=? AND nation_id='korund' AND NOT EXISTS(SELECT 1 FROM korund_rations WHERE clerk_user_id=? AND game_week=?) AND NOT EXISTS(SELECT 1 FROM korund_ration_queue WHERE clerk_user_id=? AND game_week=? AND status='waiting') AND NOT EXISTS(SELECT 1 FROM korund_queue_cancellations WHERE request_id=?) AND NOT EXISTS(SELECT 1 FROM korund_rations WHERE id=?) AND NOT EXISTS(SELECT 1 FROM korund_meals WHERE id=?) AND NOT EXISTS(SELECT 1 FROM work_shifts WHERE id=?)`).bind(id,gameWeek,now,expiresAt,userId,userId,gameWeek,userId,gameWeek,id,id,id,id).run();
  const joined=await db.prepare('SELECT request_id FROM korund_ration_queue WHERE request_id=? AND clerk_user_id=?').bind(id,userId).first();
  return joined?{status:200}:{status:409,error:'An active ration request already exists or this week’s coupons were used. Refresh the ration book.'};
 }
 await db.batch([
  db.prepare(`UPDATE korund_ration_queue SET status='cancelled' WHERE request_id=? AND clerk_user_id=? AND game_week=? AND expires_at>? AND status='waiting' AND EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id='korund') AND NOT EXISTS(SELECT 1 FROM korund_queue_cancellations WHERE request_id=?) AND NOT EXISTS(SELECT 1 FROM korund_ration_queue WHERE request_id=?) AND NOT EXISTS(SELECT 1 FROM korund_rations WHERE id=?) AND NOT EXISTS(SELECT 1 FROM korund_meals WHERE id=?) AND NOT EXISTS(SELECT 1 FROM work_shifts WHERE id=?)`).bind(queueId!,userId,gameWeek,now,userId,id,id,id,id,id),
  db.prepare('INSERT OR IGNORE INTO korund_queue_cancellations(request_id,queue_id,clerk_user_id,cancelled_at) SELECT ?,?,?,? WHERE changes()=1').bind(id,queueId!,userId,now),
 ]);
 const cancelled=await db.prepare('SELECT request_id FROM korund_queue_cancellations WHERE request_id=? AND clerk_user_id=? AND queue_id=?').bind(id,userId,queueId!).first();
 return cancelled?{status:200}:{status:409,error:'This ration request is unavailable, expired or already collected. Refresh the ration book.'};
}
