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

export type KorundCoupon={kind:KorundCouponKind;label:string;item:string;quantity:number;priceMinor:number;used:boolean;expiresAt:string};
export type KorundQuota={workUnit:string;targetFood:number;unitFood:number;ownFood:number;weekStartsAt:string;weekEndsAt:string};

/** LN spent on coupon goods; subtract from wages for the LN balance. */
export const korundCouponSpendSql=`COALESCE((SELECT SUM(price_minor) FROM korund_coupon_redemptions WHERE clerk_user_id=?),0)`;

// Coupons are bound to the redeeming citizen, the current game week and their own LN balance.
// There is no transfer path: no other account can redeem them and past weeks are rejected.
export const korundCouponRedeemSql=`INSERT OR IGNORE INTO korund_coupon_redemptions(id,clerk_user_id,game_week,coupon,item,quantity,price_minor,occurred_at)
 SELECT ?,clerk_user_id,?,?,?,1,?,? FROM citizens WHERE clerk_user_id=? AND nation_id='korund'
 AND NOT EXISTS(SELECT 1 FROM korund_coupon_redemptions WHERE clerk_user_id=? AND game_week=? AND coupon=?)
 AND ?<=COALESCE((SELECT SUM(wage_minor) FROM korund_settlements WHERE clerk_user_id=?),0)-COALESCE((SELECT SUM(price_minor) FROM korund_coupon_redemptions WHERE clerk_user_id=?),0)`;

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
