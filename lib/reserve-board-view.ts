import type { ReserveBoard } from './spark-supply';
import { reserveBoardLine } from './reserve-board-copy'; // #460: Content's wording, used as written; only the {supply} {issued} {index} slots are filled here

const minor = (value: number) => `${(Math.max(0, value) / 100).toFixed(2)} SPK`;
/** The read-only Reserve Board lines for Kindle citizens (#431): copy from #460 with the figures dropped into its slots. */
export function reserveBoardRows(reserve: ReserveBoard) {
  const issued = reserve.lastIssuance ? (reserve.lastIssuance.amountMinor === 0 ? 'none' : `+${minor(reserve.lastIssuance.amountMinor)}`) : 'none';
  return {
    header: reserveBoardLine.header,
    rows: [reserveBoardLine.rows.moneySupply.replace('{supply}', minor(reserve.moneySupplyMinor)), reserveBoardLine.rows.lastIssuance.replace('{issued}', issued),
      reserveBoardLine.rows.priceIndex.replace('{index}', reserve.priceIndex.toFixed(1))],
    caption: reserveBoardLine.caption.text,
  };
}
