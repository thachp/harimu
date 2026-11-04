import { nationMark } from '../lib/nation-themes';
import { varkandAlertLevel, varkandAlertMeaning, varkandAlertName, varkandDispatchEnabled, type VarkandAlertLevel } from '../lib/varkand-dispatch';

/** Outline shapes, one per level, so the banner is not told apart by color alone. */
const alertMark: Readonly<Record<VarkandAlertLevel, string>> = { green: '○', amber: '△', red: '□' };

/** Full-width Alert Level banner. Static text: no live region. Flag off renders nothing. */
export function VarkandAlertBanner({ alertLevel }: { alertLevel?: unknown }) {
  if (!varkandDispatchEnabled()) return null;
  const level = varkandAlertLevel(alertLevel);
  const name = varkandAlertName[level];
  return <div className="varkand-alert" data-alert={level}>
    <span className="varkand-alert-mark" aria-hidden="true">{alertMark[level]}</span>
    <div className="varkand-alert-copy">
      <p className="varkand-alert-name" aria-label={`Alert Level: ${name}`}>Alert Level · {name}</p>
      <p className="varkand-alert-meaning">{varkandAlertMeaning[level]}</p>
    </div>
  </div>;
}

/** Decorative stamp. The words beside it are the accessible name. */
export function VarkandDispatchStamp() {
  return <span className="varkand-dispatch-stamp" aria-hidden="true">{nationMark('varkand')?.symbol}</span>;
}
