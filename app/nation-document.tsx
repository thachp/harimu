import type { CSSProperties, ReactNode } from 'react';
import { nationTheme } from '../lib/nation-themes';
export function NationMark({nationId}:{nationId:string}){
 const theme=nationTheme(nationId);return theme?<span className="nation-document-mark" role="img" aria-label={`${theme.name} · ${theme.motif}`}>{theme.symbol}</span>:null;
}
export function NationDocument({nationId,label,className='',children}:{nationId:string;label:string;className?:string;children:ReactNode}){
 const theme=nationTheme(nationId);
 const tokens=theme?{'--nation-paper':theme.paper,'--nation-ink':theme.ink,'--nation-accent':theme.accent,'--nation-edge':theme.edge,'--nation-pattern':theme.pattern} as CSSProperties:undefined;
 return <section className={`nation-document ${className}`} data-nation-theme={theme?nationId:undefined} style={tokens} aria-label={label}>
  {theme&&<header className="nation-document-masthead"><NationMark nationId={nationId}/><span>{theme.name} · {theme.document}</span></header>}{children}
 </section>;
}
