import type {GameDatabase} from './database-contract';
import {leaderPersonas} from './leader-personas';
export const addressWeekSeconds=604800;
export const addressSchemas=[
 `CREATE TABLE IF NOT EXISTS weekly_addresses (id TEXT PRIMARY KEY,nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),week INTEGER NOT NULL CHECK(week>=0),scheduled_at INTEGER NOT NULL,published_at INTEGER NOT NULL,leader_name TEXT NOT NULL,office TEXT NOT NULL,title TEXT NOT NULL,transcript TEXT NOT NULL,provenance TEXT NOT NULL CHECK(provenance='authored-poc'),UNIQUE(nation_id,week),CHECK(published_at>=scheduled_at))`,
 `CREATE TABLE IF NOT EXISTS address_reactions (request_id TEXT PRIMARY KEY,address_id TEXT NOT NULL REFERENCES weekly_addresses(id),user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),reaction TEXT NOT NULL CHECK(reaction IN ('agree','disagree')),reacted_at INTEGER NOT NULL,UNIQUE(address_id,user_id))`,
];
const scripts={
 kindle:[['Public institutions and household life','Citizens of Kindle, our republic combines elected government with a market economy and secular pluralism. Forgehaven is our capital. Human citizens contribute through their own work and civic channels; government offices in this preview are held by simulated leaders. This authored address announces no vote result, appropriation or completed project.'],['Work and public accountability','Citizens of Kindle, work and trade support household life. The Spark is our national currency. Public discussion belongs in the nation conversation and supported civic channels. This address makes no claim about prices, reserves or citizen petition outcomes; recorded system statistics are shown separately.']],
 korund:[['Continuity of state planning','Citizens of Korund, Stonehearth is our capital. Our system is central planning under a Chairman for life, with Labor Notes and ration coupons. This is an official public statement, not a disclosure of council deliberation. No production percentage or distribution result is asserted in this authored transcript.'],['Work and the ration system','Citizens of Korund, assigned production and the ration system define our economic institutions. The preview records public food and completed settlements separately. This address does not announce a new quota, issue coupons or claim that a target has been met. Private council reasoning is not part of this public statement.']],
 aurelle:[['The Crown and the chartered economy','Citizens of Aurelle, Highspire is our capital. Our nation is an hereditary monarchy with royal charters and fiefs, the Crown as its currency, and the Kinward Rite as its state church. This authored court address is not a new decree and changes no charter, balance or succession.'],['Service and the royal council','Citizens of Aurelle, the royal council is an institution of the monarchy. Government offices in this preview are held by simulated leaders; human players remain citizens. This address announces no petition outcome or royal appropriation. Actual decrees and resource records must be read from their own authoritative records.']],
} as const;
export type Address={id:string;week:number;scheduledAt:number;publishedAt:number;leaderName:string;office:string;title:string;transcript:string;provenance:'authored-poc';agree:number;disagree:number;ownReaction:'agree'|'disagree'|null};
export type AddressArchive={nationId:string;currentWeek:number;nextAddressAt:number;addresses:Address[];nextBeforeWeek:number|null};
export async function publishDueAddress(db:GameDatabase,userId:string,nationId:string,now:number){
 if(!Object.hasOwn(scripts,nationId))return null;
 const clock=await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>();
 if(!clock||now<clock.epoch_seconds)return null;
 const week=Math.floor((now-clock.epoch_seconds)/addressWeekSeconds),scheduledAt=clock.epoch_seconds+week*addressWeekSeconds;
 const persona=leaderPersonas[nationId as keyof typeof scripts],script=scripts[nationId as keyof typeof scripts][week%2];
 // Publish only the current period, never fabricate missed historical broadcasts.
 await db.prepare(`INSERT OR IGNORE INTO weekly_addresses(id,nation_id,week,scheduled_at,published_at,leader_name,office,title,transcript,provenance)
 SELECT ?,?,?,?,?,?,?,?,?,'authored-poc' FROM citizens WHERE clerk_user_id=? AND nation_id=?`)
 .bind(`${nationId}:address:${week}`,nationId,week,scheduledAt,now,persona.name,persona.office,script[0],script[1],userId,nationId).run();
 return {week,nextAddressAt:scheduledAt+addressWeekSeconds};
}
export async function readAddressArchive(db:GameDatabase,userId:string,nationId:string,now:number,beforeWeek?:number):Promise<AddressArchive|null>{
 const due=await publishDueAddress(db,userId,nationId,now);if(!due)return null;
 const rows=await db.prepare(`SELECT a.*,
 (SELECT COUNT(*) FROM address_reactions WHERE address_id=a.id AND reaction='agree') AS agree,
 (SELECT COUNT(*) FROM address_reactions WHERE address_id=a.id AND reaction='disagree') AS disagree,
 (SELECT reaction FROM address_reactions WHERE address_id=a.id AND user_id=?) AS own_reaction
 FROM weekly_addresses a WHERE a.nation_id=? AND a.week<? AND EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id=?) ORDER BY a.week DESC LIMIT 13`)
 .bind(userId,nationId,beforeWeek??due.week+1,userId,nationId).all<{id:string;week:number;scheduled_at:number;published_at:number;leader_name:string;office:string;title:string;transcript:string;provenance:'authored-poc';agree:number;disagree:number;own_reaction:'agree'|'disagree'|null}>();
 const addresses=rows.results.slice(0,12).map(r=>({id:r.id,week:r.week,scheduledAt:r.scheduled_at,publishedAt:r.published_at,leaderName:r.leader_name,office:r.office,title:r.title,transcript:r.transcript,provenance:r.provenance,agree:r.agree,disagree:r.disagree,ownReaction:r.own_reaction??null}));
 return {nationId,currentWeek:due.week,nextAddressAt:due.nextAddressAt,addresses,nextBeforeWeek:rows.results.length>12?addresses.at(-1)!.week:null};
}
