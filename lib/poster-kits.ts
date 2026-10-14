/** Approved poster-kit slogans and frame captions for the MVP nations (issue #248). Content only: no poster UI reads
 * this yet. harimu-docs social-news-media §18.3: posters are composed from approved kits (nation frames, icons, slogans,
 * filtered text), not free uploads. §18.2: truth in the data, spin in the words, so a slogan never hard-codes a figure;
 * live numbers come only through the placeholders below, filled from the ledger. All prose is new wording, so
 * `proposal: true`. Authored kit copy, not AI output. No people, parties or places from the real world; no "Notable".
 * Art and icons are UX's (out of scope here). */

export type PosterNation='kindle'|'korund'|'aurelle';
/** Placeholders a poster UI may fill. The ledger supplies the raw figure; the UI does all formatting (e.g. percent sign,
 * rounding). Kit text never formats or hard-codes a number. Korund output figures only ever arrive this way. */
export const POSTER_PLACEHOLDERS=['{output_pct}','{city}','{brigade}'] as const;
export type PosterPlaceholder=typeof POSTER_PLACEHOLDERS[number];
/** Festival themes. A themed frame accepts only slogans with the same theme; a neutral frame accepts any slogan of its nation. */
export type PosterTheme='ballot-night'|'hearth-night';
export type PosterSlogan={id:string;text:string;theme?:PosterTheme;proposal:true};
export type PosterFrame={id:string;name:string;caption:string;theme?:PosterTheme;proposal:true};
export type PosterKit={nationId:PosterNation;voice:string;slogans:readonly PosterSlogan[];frames:readonly PosterFrame[]};

export const POSTER_SLOGAN_MAX=48;
export const POSTER_FRAME_NAME_MAX=32;
export const POSTER_CAPTION_MAX=100;
export const POSTER_SLOGANS_MIN=10, POSTER_SLOGANS_MAX=15, POSTER_FRAMES_MIN=3, POSTER_FRAMES_MAX=5;

type SloganIn=string|readonly [string,PosterTheme];
type FrameIn=readonly [string,string]|readonly [string,string,PosterTheme];
const kit=(nationId:PosterNation,voice:string,slogans:readonly SloganIn[],frames:readonly FrameIn[]):PosterKit=>({
 nationId,voice,
 slogans:slogans.map((x,i)=>{const [text,theme]=typeof x==='string'?[x,undefined]:x;
  return {id:`${nationId}-slogan-${String(i+1).padStart(2,'0')}`,text,...(theme?{theme}:{}),proposal:true as const};}),
 frames:frames.map(([name,caption,theme])=>({id:`${nationId}-frame-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`,name,caption,...(theme?{theme}:{}),proposal:true as const})),
});

export const kindlePosterKit=kit('kindle','Campaign and civic: plain, competitive, price-proud. "Strike your own spark."',[
 'Strike your own spark.',
 ['Vote on Ballot Night.','ballot-night'],
 ['Your ballot, your Republic.','ballot-night'],
 'Many voices, one plaza.',
 'Show your number.',
 'Ask where the Sparks go.',
 'Read the Reasoning Brief.',
 ['A fair count, every time.','ballot-night'],
 'Speak plainly. Vote freely.',
 'Second chances built this city.',
 'Question your Assembly.',
 'Shake on it. Keep it.',
],[
 ['Billboard','Bold campaign billboard in ember orange and brass.'],
 ['Plaza Notice','Civic notice for the plaza board, basalt black with brass trim.'],
 ['Spark Ticker','Scrolling strip in the style of the Spark price tickers.'],
 ['Ballot Night','Festival frame lit like the Assembly dome on Ballot Night.','ballot-night'],
]);

export const korundPosterKit=kit('korund','Plan and quota: collective, steady, monumental. Figures arrive only through placeholders.',[
 'One hammer, one heart.',
 'Output at {output_pct} of plan.',
 '{city} advances the plan.',
 'Brigade {brigade}: quota met.',
 'Shift by shift, the plan is built.',
 'Praise the brigade.',
 'A fed worker is a strong worker.',
 'Redeem your coupons on time.',
 'Order at the rails is fairness.',
 'The Production Drive needs every hand.',
 'Plan Day: the work continues.',
 'Stone endures. So do we.',
],[
 ['Mosaic','Ochre and slate tile frame in the style of the plaza mosaics.'],
 ['Plan Banner','Rust-red banner for Production Drive halls.'],
 ['Loudspeaker Plaza','Plain notice frame for the loudspeaker plazas.'],
 ['Quota Board','Grey board frame with space for a ledger figure.'],
]);

export const aurellePosterKit=kit('aurelle','Crown, Favor and Kinward: ornate, deferential, ranked. "Every thread in its place."',[
 'Every thread in its place.',
 'Serve the Crown with grace.',
 'Faithful service is noticed.',
 'Favor follows the faithful.',
 'Bow by rank, speak in turn.',
 ['Keep the Hearth, keep the realm.','hearth-night'],
 ['Tend the name-stones.','hearth-night'],
 ['Honor the Keeper of the Hearth.','hearth-night'],
 'Long reign the Sky Throne.',
 'Charter Fair: trade by royal leave.',
 'Wear no higher than your rank.',
],[
 ['Royal Seal','Sky blue and white scroll frame with a gilt seal.'],
 ['Heraldic','Gilt-edged heraldic frame with no house arms.'],
 ['Hearth Night','Warm frame for Kinward Rite notices and Hearth Night.','hearth-night'],
]);

export const posterKits:Readonly<Record<PosterNation,PosterKit>>={kindle:kindlePosterKit,korund:korundPosterKit,aurelle:aurellePosterKit};
/** A themed frame takes only slogans of the same theme; a neutral frame takes any slogan. Both must be one nation's. */
export function frameAccepts(nationId:PosterNation,frame:PosterFrame,slogan:PosterSlogan){
 const k=posterKits[nationId];
 if(!k.frames.includes(frame)||!k.slogans.includes(slogan))return false;
 return frame.theme===undefined||frame.theme===slogan.theme;
}
export function posterKit(nationId:string){return (posterKits as Record<string,PosterKit|undefined>)[nationId];}
