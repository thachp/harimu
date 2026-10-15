/** Visitor-safe heading for the context strip under the 3D scene (issue #565, follow-up to the visitor wording work in #558). Content only:
 * nothing imports this module until the shell is switched over, and the strip itself is not touched here. The strip's heading span in the
 * game shell is a chain: a guest example says "Disposable sample", the browser-local demo says "Browser-local demo", the country view says
 * "Static lore · opt-in presence", and every other state says "Citizen snapshot". The last one is wrong for a visitor, who has no citizen, so
 * this module keeps the first three exactly as they are and adds one new label, "Visitor preview", which matches the "VISITOR PREVIEW" label
 * the same visitor work puts on the inspector. A citizen keeps "Citizen snapshot".
 *
 * `contextStripStatus` is the whole chain as one tiny pure function, in the shell's own order, so the shell can swap its inline chain for one
 * call. `visitor` means no citizen nation and a session that has finished loading (the visitor work's own rule), so it is false while a
 * citizen's session loads and a citizen reloading a city never sees the visitor label. Nothing here changes who counts as a visitor. The
 * three existing labels are not new wording (`proposal: false`); only the visitor label is new (`proposal: true`). Limit: labels 40. */

export const CONTEXT_STRIP_LABEL_MAX=40;

export type Label={text:string;proposal:boolean};
const L=(text:string,proposal:boolean):Label=>({text,proposal});

export const contextStripLabels={
 guestDemo:L('Disposable sample',false),
 localDemo:L('Browser-local demo',false),
 country:L('Static lore · opt-in presence',false),
 citizen:L('Citizen snapshot',false),
 visitor:L('Visitor preview',true),
} as const;

export type ContextStripState={guestDemo?:boolean;localDemo?:boolean;country?:boolean;visitor?:boolean};

/** The heading span for the context strip: the shell's chain, with the last label split between a citizen and a visitor. */
export function contextStripStatus(state:ContextStripState):string{
 if(state.guestDemo)return contextStripLabels.guestDemo.text;
 if(state.localDemo)return contextStripLabels.localDemo.text;
 if(state.country)return contextStripLabels.country.text;
 return state.visitor?contextStripLabels.visitor.text:contextStripLabels.citizen.text;
}
