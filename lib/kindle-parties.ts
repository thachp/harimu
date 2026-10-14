/** Kindle AI parties and platform-card pledge catalog (issue #257). Content only: lib/elections.ts is unchanged and
 * nothing reads this yet. Canon: harimu-docs politics/elections §9.4 (AI parties have a name, an invented ideology
 * inside the nation's bands, colors, a roster and a platform; each AI candidate picks up to 5 pledges from a
 * structured list), politics/ai-leadership (ideologies are invented, in-world, never mapped to real parties; e.g. a
 * low-tax Kindle conservative vs a welfare-minded Kindle liberal) and the Kindle Republic page (democracy plus
 * capitalism, progressive income, sales and land tax set by law, palette ember orange, basalt black and brass).
 * Parties and candidates are AI. Pledges carry no figures, so none is invented. All prose is new: `proposal: true`. */

export type PledgeCategory='tax'|'jobs'|'housing'|'trade'|'frontier'|'civic';
export type KindleParty={id:string;name:string;ideology:string;color:string;blurb:string;ai:true;proposal:true};
export type Pledge={key:string;category:PledgeCategory;card:string;brokenPressLine:string;proposal:true};

export const PLEDGE_CARD_MAX=80;
export const PLEDGE_PRESS_MAX=140;
export const PARTY_NAME_MAX=32;
export const PARTY_IDEOLOGY_MAX=100;
export const PARTY_BLURB_MAX=280;
export const PLEDGES_PER_CANDIDATE_MIN=3;
export const PLEDGES_PER_CANDIDATE_MAX=5;

const party=(id:string,name:string,ideology:string,color:string,blurb:string):KindleParty=>({id,name,ideology,color,blurb,ai:true,proposal:true});
const p=(key:string,category:PledgeCategory,card:string,brokenPressLine:string):Pledge=>({key,category,card,brokenPressLine,proposal:true});

export const kindleParties:readonly KindleParty[]=[
 party('steady-hand','Steady Hand Party','Work for everyone first; trade opened with care, one deal at a time.','Brass',
  'A job for every Resident who wants one. New trade deals only when they keep work at home. Slow and sure, and proud of it.'),
 party('open-ledger','Open Ledger Party','Low taxes and open markets; let prices and traders do the work.','Ember Orange',
  'Lighter taxes, fewer rules and markets open to every trader. Strike your own spark and keep more of it.'),
 party('dockside-builders','Dockside Builders','Build it in public: homes, docks and works the whole Republic can use.','Basalt Black',
  'Public housing for those priced out, and docks to bring the trade in. If the market will not build it, the Republic should.'),
];

export const pledgeCatalog:readonly Pledge[]=[
 p('tax-lower-income','tax','Lower the income tax','The promised income tax cut has not come.'),
 p('tax-lower-sales','tax','Cut the sales tax','Shoppers still pay the old sales tax, despite the pledge.'),
 p('tax-fair-land','tax','Review the land tax','The land tax review was promised. It has not begun.'),
 p('jobs-full-employment','jobs','A job for every Resident who wants one','Residents are still looking for work the campaign promised.'),
 p('jobs-public-works','jobs','Hire for public works','The public works hiring never started.'),
 p('jobs-mines','jobs','Reopen frontier mine shifts','The frontier mine shifts are still closed.'),
 p('housing-public','housing','Build public housing','The public housing promised on the trail is still on paper.'),
 p('housing-rent-board','housing','Post every rent in public','Rents are still not posted, despite the pledge.'),
 p('trade-meridian-deal','trade','Trade deal with Meridian','No trade deal with Meridian has been signed.'),
 p('trade-open-markets','trade','Open the markets to every trader','Markets are no more open than before the vote.'),
 p('trade-careful-deals','trade','No trade deal that costs Kindle jobs','A trade deal went through without a word on jobs.'),
 p('frontier-new-cities','frontier','Found new frontier cities','No new frontier city has been founded.'),
 p('frontier-docks','frontier','Build new docks at Brasswell Port','The new docks at Brasswell Port are not built.'),
 p('civic-open-ballots','civic','Count every ballot in public view','The public count the campaign promised has not happened.'),
 p('civic-fewer-rules','civic','Cut red tape for new companies','Founding a company takes as long as it did.'),
];

/** Each existing lib/elections.ts candidate maps to one party and 3-5 pledges that keep its one-line platform true. */
export const kindleCandidatePlatforms:Readonly<Record<string,{partyId:string;pledges:readonly string[]}>>={
 'ines-varro':{partyId:'steady-hand',pledges:['jobs-full-employment','jobs-public-works','trade-careful-deals','jobs-mines']},
 'tobin-achterberg':{partyId:'open-ledger',pledges:['tax-lower-income','tax-lower-sales','trade-open-markets','trade-meridian-deal','civic-fewer-rules']},
 'mara-quell':{partyId:'dockside-builders',pledges:['housing-public','frontier-docks','housing-rent-board','tax-fair-land']},
};

export function pledge(key:string){return pledgeCatalog.find(x=>x.key===key);}
export function kindleParty(id:string){return kindleParties.find(x=>x.id===id);}
