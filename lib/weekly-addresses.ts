import type {GameDatabase} from './database-contract';
import {leaderPersonas} from './leader-personas';
import {currentChairmanName} from './korund-presidium';
export const addressWeekSeconds=604800;
export const addressSchemas=[
 `CREATE TABLE IF NOT EXISTS weekly_addresses (id TEXT PRIMARY KEY,nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),week INTEGER NOT NULL CHECK(week>=0),scheduled_at INTEGER NOT NULL,published_at INTEGER NOT NULL,leader_name TEXT NOT NULL,office TEXT NOT NULL,title TEXT NOT NULL,transcript TEXT NOT NULL,provenance TEXT NOT NULL CHECK(provenance='authored-poc'),UNIQUE(nation_id,week),CHECK(published_at>=scheduled_at))`,
 `CREATE TABLE IF NOT EXISTS address_reactions (request_id TEXT PRIMARY KEY,address_id TEXT NOT NULL REFERENCES weekly_addresses(id),user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),reaction TEXT NOT NULL CHECK(reaction IN ('agree','disagree')),reacted_at INTEGER NOT NULL,UNIQUE(address_id,user_id))`,
];
// Copy only (#118): each transcript speaks in its nation's voice (culture bible; docs/NEWS_STYLE_GUIDE.md).
// Authored addresses never announce votes, quotas, decrees, prices or outcomes; real records are shown separately.
const scripts={
 kindle:[['Public institutions and household life','Citizens of Kindle, straight talk from Forgehaven. This republic runs on elected government, an open market and room for every faith, with the state favoring none. You strike your own spark: your work, your trades, your voice in civic channels. One thing on the record: government offices in this preview are held by simulated leaders, and every human here is a citizen. This authored address announces no vote result, appropriation or finished project. When there is a number to show, it will be posted, not promised.'],['Work and public accountability','Citizens of Kindle, work and trade keep our households running, and the Spark is the currency we earn them in. If you have something to say about how this office does its job, say it in the nation conversation and the civic channels. That is what they are for. This authored address makes no claim about prices, reserves or petition outcomes. The recorded system statistics sit on their own board. Check them yourself.']],
 korund:[['Continuity of state planning','Citizens of Korund, from Stonehearth the Presidium addresses the brigades. Our nation stands on central planning under a Chairman for life, on Labor Notes and the ration coupon. One hammer, one heart. This is an official public statement, and the deliberations of the council remain with the council. No production percentage or distribution result is asserted in this authored transcript. The brigades stand ready for the next plan period.'],['Work and the ration system','Citizens of Korund, assigned production and the ration system are the foundation of our economy, and every brigade is part of it. The common store and completed settlements are recorded publicly, apart from this statement. This authored address announces no new quota, issues no coupons and claims no target met. The reasoning of the council is not part of this public statement. Work well, and the plan continues.']],
 aurelle:[['The Crown and the chartered economy','Hear ye, citizens of Aurelle, by leave of the Crown, from Highspire. Ours is an hereditary monarchy, ordered by royal charter and fief, kept in the Crown as its coin and blessed by the Kinward Rite as the church of the realm. Every thread in its place. Let it be understood that this authored court address is no new decree. It alters no charter, no balance and no succession.'],['Service and the royal council','Hear ye, citizens of Aurelle. The royal council serves as an institution of the monarchy. Be it known that the offices of government in this preview are held by simulated leaders, and that every human player remains a citizen of the realm. This address announces no petition outcome and no royal appropriation. Decrees and the records of the treasury are to be read in their own proper rolls, and not here.']],
} as const;
export type Address={id:string;week:number;scheduledAt:number;publishedAt:number;leaderName:string;office:string;title:string;transcript:string;provenance:'authored-poc';agree:number;disagree:number;ownReaction:'agree'|'disagree'|null};
export type AddressArchive={nationId:string;currentWeek:number;nextAddressAt:number;addresses:Address[];nextBeforeWeek:number|null};
export async function publishDueAddress(db:GameDatabase,userId:string,nationId:string,now:number,options:{korundPresidium?:boolean}={}){
 if(!Object.hasOwn(scripts,nationId))return null;
 const clock=await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>();
 if(!clock||now<clock.epoch_seconds)return null;
 const week=Math.floor((now-clock.epoch_seconds)/addressWeekSeconds),scheduledAt=clock.epoch_seconds+week*addressWeekSeconds;
 const authored=leaderPersonas[nationId as keyof typeof scripts],script=scripts[nationId as keyof typeof scripts][week%2];
 // #70: Korund's address is given by the current Chairman (the Chosen Comrade after a purge).
 const persona=nationId==='korund'&&options.korundPresidium?{...authored,name:await currentChairmanName(db)}:authored;
 // Publish only the current period, never fabricate missed historical broadcasts.
 await db.prepare(`INSERT OR IGNORE INTO weekly_addresses(id,nation_id,week,scheduled_at,published_at,leader_name,office,title,transcript,provenance)
 SELECT ?,?,?,?,?,?,?,?,?,'authored-poc' FROM citizens WHERE clerk_user_id=? AND nation_id=?`)
 .bind(`${nationId}:address:${week}`,nationId,week,scheduledAt,now,persona.name,persona.office,script[0],script[1],userId,nationId).run();
 return {week,nextAddressAt:scheduledAt+addressWeekSeconds};
}
export async function readAddressArchive(db:GameDatabase,userId:string,nationId:string,now:number,beforeWeek?:number,options:{korundPresidium?:boolean}={}):Promise<AddressArchive|null>{
 const due=await publishDueAddress(db,userId,nationId,now,options);if(!due)return null;
 const rows=await db.prepare(`SELECT a.*,
 (SELECT COUNT(*) FROM address_reactions WHERE address_id=a.id AND reaction='agree') AS agree,
 (SELECT COUNT(*) FROM address_reactions WHERE address_id=a.id AND reaction='disagree') AS disagree,
 (SELECT reaction FROM address_reactions WHERE address_id=a.id AND user_id=?) AS own_reaction
 FROM weekly_addresses a WHERE a.nation_id=? AND a.week<? AND EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id=?) ORDER BY a.week DESC LIMIT 13`)
 .bind(userId,nationId,beforeWeek??due.week+1,userId,nationId).all<{id:string;week:number;scheduled_at:number;published_at:number;leader_name:string;office:string;title:string;transcript:string;provenance:'authored-poc';agree:number;disagree:number;own_reaction:'agree'|'disagree'|null}>();
 const addresses=rows.results.slice(0,12).map(r=>({id:r.id,week:r.week,scheduledAt:r.scheduled_at,publishedAt:r.published_at,leaderName:r.leader_name,office:r.office,title:r.title,transcript:r.transcript,provenance:r.provenance,agree:r.agree,disagree:r.disagree,ownReaction:r.own_reaction??null}));
 return {nationId,currentWeek:due.week,nextAddressAt:due.nextAddressAt,addresses,nextBeforeWeek:rows.results.length>12?addresses.at(-1)!.week:null};
}
