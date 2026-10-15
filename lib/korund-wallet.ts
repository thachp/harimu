/** The ONE Labor Note (LN) balance formula for Korund citizens (#43). Everything that reads or guards an LN balance uses this:
 * the plan's wallet, the coupon spend guard and the post-commit overdraft re-check in lib/korund.ts. Do not copy it inline.
 *
 * LN balance = wages settled
 *            - coupon prices paid
 *            + LN received in accepted gray-market trades (as the accepting buyer)
 *            - LN given in accepted gray-market trades (as the posting seller).
 * Pure and dependency-free (no imports) so SQL-fixture tests can load it directly. */
export const laborNoteParams = 4;
/** `user` is the SQL for the citizen id: `?` (then bind laborNoteBinds(id)) or a column such as `citizens.clerk_user_id` (no binds). */
export function laborNoteSql(user: string): string {
  return `(COALESCE((SELECT SUM(wage_minor) FROM korund_settlements WHERE clerk_user_id=${user}),0)`
    + `-COALESCE((SELECT SUM(price_minor) FROM korund_coupon_redemptions WHERE clerk_user_id=${user}),0)`
    + `+COALESCE((SELECT SUM(amount_minor) FROM gray_trades WHERE buyer_id=${user}),0)`
    + `-COALESCE((SELECT SUM(amount_minor) FROM gray_trades WHERE seller_id=${user}),0))`;
}
/** The binds for laborNoteSql('?'): the citizen id once per `?` in the expression. */
export const laborNoteBinds = (userId: string): string[] => Array.from({ length: laborNoteParams }, () => userId);
