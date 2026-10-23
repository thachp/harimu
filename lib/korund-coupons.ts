import type {GameDatabase} from './database-contract';
// Issue #41: weekly Korund ration coupons (food, clothing, goods) and the work-unit quota bar.
// Food coupons keep the existing ration/queue flow (korund_rations). Clothing and goods
// coupons are redeemed for one fixed-price item each, paid in Labor Notes.
export type KorundCouponKind='food'|'clothing'|'goods';
export const korundCouponGoods={
 clothing:{label:'Clothing coupon',item:'state work clothing',quantity:1,priceMinor:200},
 goods:{label:'Goods coupon',item:'household goods bundle',quantity:1,priceMinor:300},
} as const;
export const korundFoodCoupon={label:'Food coupon',item:'state food',quantity:2,priceMinor:0} as const;
/** Weekly brigade quota in food units (10 assigned shifts × 4 food). PoC placeholder. */
export const korundWeeklyQuotaFood=40;
export const korundWorkUnit='Stonehearth food-production brigade';

export const korundCouponSchemas=[
 `CREATE TABLE IF NOT EXISTS korund_coupon_redemptions (id TEXT PRIMARY KEY,clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),game_week INTEGER NOT NULL CHECK(game_week>=1),coupon TEXT NOT NULL CHECK(coupon IN ('clothing','goods')),item TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity=1),price_minor INTEGER NOT NULL CHECK(price_minor>0),occurred_at INTEGER NOT NULL,UNIQUE(clerk_user_id,game_week,coupon))`,
] as const;

export type KorundCoupon={kind:KorundCouponKind;label:string;item:string;quantity:number;priceMinor:number;used:boolean;expiresAt:string;/** #776: withdrawn by a ration cut this week (flag on only). */withdrawn?:true};
export type KorundQuota={workUnit:string;targetFood:number;unitFood:number;ownFood:number;weekStartsAt:string;weekEndsAt:string};

/** LN spent on coupon goods; subtract from wages for the LN balance. */
export const korundCouponSpendSql=`COALESCE((SELECT SUM(price_minor) FROM korund_coupon_redemptions WHERE clerk_user_id=?),0)`;

// Coupons are bound to the redeeming citizen, the current game week and their own LN balance.
// There is no transfer path: no other account can redeem them and past weeks are rejected.
/** `laborNote` is the shared LN balance expression from lib/korund-wallet (laborNoteSql('?'), bind laborNoteBinds(userId) after the price).
 * Passed in so this file keeps no runtime import and the one formula lives in one place. */
export const korundCouponRedeemSql=(laborNote:string)=>`INSERT OR IGNORE INTO korund_coupon_redemptions(id,clerk_user_id,game_week,coupon,item,quantity,price_minor,occurred_at)
 SELECT ?,clerk_user_id,?,?,?,1,?,? FROM citizens WHERE clerk_user_id=? AND nation_id='korund'
 AND NOT EXISTS(SELECT 1 FROM korund_coupon_redemptions WHERE clerk_user_id=? AND game_week=? AND coupon=?)
 AND ?<=${laborNote}`; // the one shared LN formula (lib/korund-wallet): wages - coupons + gray-market trades; bind laborNoteBinds(userId) after the price

export function buildCoupons(foodUsed:boolean,used:Set<string>,expiresAt:string):KorundCoupon[]{
 return [{kind:'food',...korundFoodCoupon,used:foodUsed,expiresAt},
  ...(['clothing','goods'] as const).map(kind=>({kind,...korundCouponGoods[kind],used:used.has(kind),expiresAt}))];
}

export async function readCouponsAndQuota(db:GameDatabase,userId:string,gameWeek:number,foodUsed:boolean,weekStart:number,weekEnd:number){
 const [used,quota,goods]=await Promise.all([
  db.prepare('SELECT coupon FROM korund_coupon_redemptions WHERE clerk_user_id=? AND game_week=?').bind(userId,gameWeek).all<{coupon:string}>(),
  db.prepare('SELECT COALESCE(SUM(food_output),0) AS unit_food,COALESCE(SUM(CASE WHEN clerk_user_id=? THEN food_output ELSE 0 END),0) AS own_food FROM korund_settlements WHERE settled_at>=? AND settled_at<?').bind(userId,weekStart,weekEnd).first<{unit_food:number;own_food:number}>(),
  db.prepare("SELECT COALESCE(SUM(CASE WHEN coupon='clothing' THEN quantity ELSE 0 END),0) AS clothing,COALESCE(SUM(CASE WHEN coupon='goods' THEN quantity ELSE 0 END),0) AS goods FROM korund_coupon_redemptions WHERE clerk_user_id=?").bind(userId).first<{clothing:number;goods:number}>(),
 ]);
 const expiresAt=new Date(weekEnd*1000).toISOString();
 return {coupons:buildCoupons(foodUsed,new Set(used.results.map(r=>r.coupon)),expiresAt),
  quota:{workUnit:korundWorkUnit,targetFood:korundWeeklyQuotaFood,unitFood:Number(quota?.unit_food??0),ownFood:Number(quota?.own_food??0),weekStartsAt:new Date(weekStart*1000).toISOString(),weekEndsAt:expiresAt} satisfies KorundQuota,
  clothingQuantity:Number(goods?.clothing??0),goodsQuantity:Number(goods?.goods??0)};
}

/** Share of the quota for a progress bar, clamped to 0–100. */
export function quotaPercent(food:number,target=korundWeeklyQuotaFood){return target<=0?0:Math.max(0,Math.min(100,Math.round(food*100/target)));}

/** #737 Content copy for Plan medals (lives beside the quota bar's data so the panel's existing import carries it; HARIMU_KORUND_MEDALS_ENABLED only). */
export const korundMedalCopy={
 over:(pct:number)=>`Plan over-fulfilled: ${Math.round(pct)}%`, // QA3: label under 40 characters
 overSub:"The unit's quota is met. Extra food still counts.",
 count:(n:number)=>n>0?`Plan medals: ${n}`:'Plan medals: none yet',
 rule:'One medal per closed week when your unit reaches its 40-food target and you supplied at least 8 food yourself.',
} as const;
/** #737 (ARC): the quota bar's screen-reader text; says "over-fulfilled" when the unit is over target (only with medals on, `over` > 0). */
export const korundQuotaValueText=(unitFood:number,targetFood:number,ownFood:number,over=0)=>
 `${unitFood} of ${targetFood} food${over>0?`, over-fulfilled at ${Math.round(over)}%`:''}; your contribution ${ownFood}`;

/** #759 weekly quota shortfall (docs 12.11 step 3: "under-fulfilment triggers inspections ... and lost bonuses for work units"), HARIMU_KORUND_SHORTFALL_ENABLED only.
 *  Derived on read from korund_settlements for the last CLOSED week, like #737 medals: no table, no migration, no write in GET, idempotent by construction.
 *  [ASSUMPTION] no work-unit bonus exists today, so the "withheld bonus" is a zero-bonus ledger line (0 LN, reason quota_shortfall) shown on read, never stored.
 *  [ASSUMPTION] every Korund citizen is a member of the single state brigade (the #41 quota bar already sums the whole unit), so each member sees one line per short week.
 *  [ASSUMPTION] the press line is returned with the plan and shown in the panel; there is no shared city feed for Korund to publish into yet. */
export type KorundShortfall={week:number;workUnit:string;unitFood:number;targetFood:number;percent:number;ledger:{bonusMinor:0;reason:'quota_shortfall'};press:string};
/** Percent of the target missed (1-100); 0 at or over target. */
export const shortfallPercent=(unitFood:number,target=korundWeeklyQuotaFood)=>target>0&&unitFood<target?Math.max(1,Math.round((target-unitFood)*100/target)):0;
export const korundShortfallCopy={
 notice:(unit:string,pct:number)=>`Inspection: ${unit} finished last week ${pct}% short of its quota.`,
 // ARC follow-up to #759/#767: plain wording; the ledger reason stays quota_shortfall. [ASSUMPTION] no work-unit bonus exists yet, so nothing is withheld.
 ledger:'No bonus withheld (work-unit bonus not yet active).',
 press:(unit:string)=>`Plan inspectors visit the ${unit} after a weekly shortfall.`,
} as const;
/** Shortfall for closed week `week` (null when the unit met its target or there is no closed week yet). */
export function korundShortfall(week:number,unitFood:number,target=korundWeeklyQuotaFood):KorundShortfall|null{
 const percent=shortfallPercent(unitFood,target);
 return week<1||percent===0?null:{week,workUnit:korundWorkUnit,unitFood,targetFood:target,percent,ledger:{bonusMinor:0,reason:'quota_shortfall'},press:korundShortfallCopy.press(korundWorkUnit)};
}

/** #776 ration cut after a plan shortfall (docs 12.11 step 4: "a shortfall cuts rations"), HARIMU_KORUND_RATION_CUT_ENABLED only.
 *  Derived on read from the same closed-week unit food as #759: no table, no migration, no write in GET, idempotent by construction.
 *  [ASSUMPTION] the food coupon (2 food) is the minimum ration and is never cut: korund_rations/korund_meals pin quantity=2 by CHECK, so a smaller
 *  food ration would need a migration and new meal math. The cut instead withdraws coupons from the next week's book, goods first, then clothing.
 *  [ASSUMPTION] step: one coupon withdrawn per started 50 points of shortfall (1-49% short: goods; 50%+ : goods and clothing). One config constant.
 *  [ASSUMPTION] Korund has one city/work unit in the PoC, so "per city per week" is per game week. */
export const korundRationCutStepPercent=50;
export const korundRationCutOrder=['goods','clothing'] as const;
export type KorundRationCut={week:number;percent:number;withdrawn:('goods'|'clothing')[]};
/** The cut for current week `week` given the previous (closed) week's shortfall percent; null when there is none. */
export function korundRationCut(week:number,shortfallPct:number,step=korundRationCutStepPercent):KorundRationCut|null{
 if(week<2||shortfallPct<=0)return null;
 return {week,percent:shortfallPct,withdrawn:korundRationCutOrder.slice(0,Math.min(korundRationCutOrder.length,1+Math.floor(shortfallPct/step)))};
}
export const applyRationCut=(coupons:KorundCoupon[],cut:KorundRationCut|null):KorundCoupon[]=>cut?coupons.map(c=>(cut.withdrawn as string[]).includes(c.kind)?{...c,withdrawn:true as const}:c):coupons;
/** Content's rationCut (lib/ration-copy.ts, #336), mirrored here so the panel keeps its one copy import (a test pins them equal). */
export const korundRationCutCopy={label:'Rations are reduced',notice:'Plan output fell short, so this week\'s rations are reduced.',withdrawn:'withdrawn this week (ration cut)'} as const;
