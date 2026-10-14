/** Name lists for AI citizens, per nation (issue #116). INACTIVE: no route, simulation or UI reads this file yet.
 * Each list follows its nation's "Language flavor" naming rule (harimu-docs content/world/nations/*.mdx; culture bible,
 * thachp/harimu-docs#3). Every name is invented. Given and family names are unique across all nations and never reuse a
 * canon, Notable or leader given name or surname, so a generated citizen can never reproduce a canon full name.
 * Screened against real celebrities, politicians and brands; tests/citizen-names.test.mjs keeps a blocklist. */
export type CitizenNation='kindle'|'confluence'|'meridian'|'korund'|'aurelle'|'ilmar'|'hoarvale'|'varkand'|'veldwood'|'fulmara';
export type CitizenNameList={rule:string;given:readonly string[];family:readonly string[]};
export const citizenNamesStatus='inactive' as const;

export const citizenNameLists:Readonly<Record<CitizenNation,CitizenNameList>>={
 kindle:{rule:'Clipped k/t/r syllables with -an/-ek/-o endings; family names from trades and forges.',
  given:['Brek','Tavo','Korran','Dekan','Rikko','Tarnek','Kesso','Varek','Torvo','Kettan','Jorek','Katto','Ruka','Tekka','Arko','Dorran','Kitran','Rasko','Teko','Brakan','Kirra','Otrek','Taska','Rekko','Karrek','Durro','Treka','Skarran','Kelto','Torrin','Verak','Ketra'],
  family:['Hammerton','Bellowsby','Coalridge','Tongsworth','Slagmore','Rivetts','Kilnley','Cinderhall','Smeltwick','Quenchford','Ingotson','Cruckett','Tinwright','Plateman','Ashwright','Hearthrock','Clinkerton','Sparwick','Kettleby','Scorrick','Bronzell','Wirebrook','Rakesmith','Pickforth','Chiselby','Lathewell','Grindstead','Basalton','Flintrow','Pitwright','Sootley','Brazenby']},
 confluence:{rule:'Flowing, vowel-rich l/m/n names with doubled vowels; a given name plus a stream or household name.',
  given:['Aleeno','Meelu','Luuma','Oonai','Neela','Mailo','Ilaan','Ooma','Leemo','Nalu','Miila','Elunu','Laanei','Noeli','Ulaam','Lioma','Meeno','Anuul','Nooral','Olani','Emmalu','Uunel','Loonia','Maaru','Inaal','Eelo','Lumaa','Nimee','Alooma','Muuni','Oleen','Naalo'],
  family:['Neem','Loor','Maal','Ullin','Seela','Liel','Oonem','Taalu','Meeru','Lunn','Aanel','Nalle','Imeel','Ormaa','Saanu','Pellu','Nooli','Vaala','Ruun','Haalo','Kuulen','Leemar','Maanu','Ilom','Teeso','Muul','Raanel','Sooma','Linnu','Ammel','Poolen','Eenal']},
 meridian:{rule:'Crisp two-syllable sh/ts/g names; given name plus family name with a rank-year suffix (e.g. -7).',
  given:['Tsavin','Shogan','Gethra','Tsamir','Shalen','Gorvan','Tsilda','Shevo','Garesh','Tseva','Shuran','Gilvo','Tsoren','Shanvo','Getsa','Tsorik','Shagen','Galdi','Tsuvar','Shimra','Gosev','Tsegra','Shavel','Gamret','Tsilo','Shedran','Gutsa','Tsarven','Shoven','Gerish','Tsanni','Shekto'],
  family:['Hesk','Tsov','Gaun','Shev','Tsal','Gorr','Shuv','Tsim','Gesh','Shol','Tsark','Gav','Dren','Tsuun','Ghal','Tsek','Gorh','Vosh','Tsurl','Gev','Shasp','Tseln','Gath','Shorr','Gulv','Shatt','Tsorv','Gesk','Shemm','Kesh','Tsogh','Haun']},
 korund:{rule:'Heavy gr/str/v clusters and deep vowels; official family names end in -ov or -ra and come first in public, followed by a brigade number.',
  given:['Grovan','Vulka','Strann','Borra','Gorla','Vosko','Druna','Grevo','Ulgra','Vashna','Krumo','Grada','Tovra','Ostro','Vrena','Gubro','Struna','Valko','Grusha','Dovro','Strekka','Vurno','Goldra','Bruvo','Ondra','Grezka','Vostra','Ruvo','Granna','Stolvo','Vulda','Krova'],
  family:['Grastov','Vrennov','Strodra','Gruvov','Torvra','Kragstov','Vulgra','Strennov','Grodra','Vashtov','Brustra','Grelvov','Stuldra','Vorgov','Drevra','Gravsov','Stravnov','Uvra','Grustov','Vodra','Krastra','Gorvov','Strenkra','Vrugov','Bolgra','Grovnov','Stulov','Vurdra','Grumstov','Dravov','Struvra','Gorkra']},
 aurelle:{rule:'Airy ae/ie vowels and liquid l/r; nobles carry a house name ("of ___").',
  given:['Liera','Saelor','Aelor','Mirael','Taeril','Ielle','Raelan','Lisiel','Caelis','Orielle','Faelor','Elaris','Rielle','Vaelith','Aurienne','Laerel','Sieleth','Maelis','Teliar','Daerin','Lirien','Aeralie','Calier','Neriel','Saeline','Roelis','Ilaere','Haelor','Eliandre','Faeriel','Lorael','Briaelle'],
  family:['Aelmont','Rierdon','Brightvane','Lauriel','Whitecliff','Saelward','Vaelcourt','Gildane','Larkspire','Aerlin','Silkharrow','Merrivane','Thierault','Lisceaux','Florimel','Galaire','Velloran','Roselys','Aubrielle','Cielmont','Faelward','Lierdale','Ravelle','Orlaine','Kestrelle','Vaerholt','Selmaire','Daelrune','Aelthorne','Brielmont','Spirewell','Taelmoor']},
 ilmar:{rule:'Measured a/o vowels and soft th/s; a virtue or light given name plus an order name.',
  given:['Solane','Thalor','Asoth','Orasa','Avoth','Losath','Sothen','Amaroth','Tholas','Saroa','Othila','Asara','Thasol','Noath','Halosa','Sorava','Ovath','Lasoth','Athona','Sohar','Marosa','Thoran','Osane','Valoth','Saothe','Iloas','Rhosa','Athsol','Dasoa','Solith','Orath','Aslora'],
  family:['Prismore','Sandvault','Lightholm','Mirrowell','Lanternby','Truesand','Glimmerhall','Soloth','Haloway','Candlemoor','Shimmerdale','Dawnmere','Morningsand','Brightvault','Sunthread','Amberlight','Glasswick','Rayholm','Lightwell','Pellusa','Saffrane','Oasith','Quietwater','Starlow','Vesperhall','Sothaly','Ambrith','Lanterholt','Dunelight','Glowmere','Prismdale','Sunstill']},
 hoarvale:{rule:'Rounded ö/aa vowels and rk/ld clusters; family names end in -hald or -mark.',
  given:['Aaske','Brögin','Daalen','Eirvö','Fröde','Gaari','Höldur','Iaak','Jörna','Kaalvi','Lööra','Maaren','Nöstra','Ölvi','Paavik','Rööna','Saarvik','Töra','Ulvaa','Vaalde','Ånnik','Björa','Daag','Eskaar','Fjölna','Hjaali','Kjörn','Maalvi','Nöre','Raask','Svaana','Tjaalve'],
  family:['Aasmark','Brennhald','Dalmark','Eiklhald','Frosthald','Grenmark','Hölmark','Isvhald','Jökulmark','Kaldmark','Ljushald','Mörkhald','Naavmark','Öyhald','Pinnhald','Rønnmark','Skårhald','Tindmark','Ulvhald','Vintermark','Ågehald','Bjerkmark','Dyrhald','Elvmark','Fellhald','Gaardmark','Hvalmark','Iskhald','Kjølmark','Lønnhald','Myrmark','Stålhald']},
 varkand:{rule:'Terse v/k/d names; given name, quoted unit call sign, family name.',
  given:['Vask','Kord','Drev','Kalda','Vekk','Dakka','Kivra','Vond','Dorka','Kesk','Vald','Dukk','Kavra','Verd','Dalk','Kodra','Vikka','Darv','Kelda','Vorrik','Duva','Karst','Vedda','Dekka','Kovin','Vadra','Dovek','Kiva','Varn','Draka','Kessa','Vodik'],
  family:['Dravik','Kessvald','Vordun','Kaldren','Dunvek','Fogmoor','Vekker','Kordal','Davrin','Kettvar','Vandor','Drekmoor','Kolvath','Varrow','Dekhurst','Vellik','Kardun','Dorvak','Kvell','Valdrik','Duskmoor','Kevrin','Vodder','Krandel','Devvan','Halvik','Vardig','Kodrin','Dravel','Vesk','Kalvorn','Dunmast']},
 veldwood:{rule:'Warm w/v/f names with -el/-wyn endings; the family name is often a Grove name ("of ___").',
  given:['Avel','Wyrel','Fenwyn','Vithel','Tamwyn','Ferel','Wistel','Merewyn','Hawel','Lowyn','Fenel','Rowel','Wendrel','Sivel','Gwyndel','Ollwyn','Varel','Brynel','Teswyn','Fiel','Wovel','Delwyn','Aswyn','Mirel','Fawyn','Inel','Harwyn','Vethel','Lisswyn','Kewel','Thurwyn','Amwel'],
  family:['Mosswick','Willowmere','Thornvale','Brackenfold','Hazelrun','Alderwyn','Birchfen','Rowanholt','Wildvetch','Fallowby','Mistwold','Larchwood','Vervain','Bramblet','Sorrelby','Oakhallow','Wrenfield','Burrowell','Hollyfen','Wychmere','Lindwell','Acornby','Heathwen','Teasel','Owlbrook','Yarrowden','Cloverhurst','Tansyfold','Sedgewell','Ivygrove','Withymoor','Glenvetch']},
 fulmara:{rule:'Quick z/ch/v names; trading-house family names end in -ara or -ezzo.',
  given:['Chezo','Vanza','Zilva','Chavo','Vezzi','Zoria','Chiva','Ravo','Zetta','Valo','Chizzi','Ozvi','Zavia','Corzo','Vichi','Zanno','Chela','Vezio','Zibo','Chessa','Vanzo','Zuli','Chavi','Vizza','Zemmo','Chena','Voza','Zinna','Chovi','Vazzi','Zevra','Chezza'],
  family:['Belvezzo','Canzara','Dorezzo','Falvara','Gravezzo','Ozzara','Pelvezzo','Quintara','Rizzara','Salvezzo','Tavara','Vanezzo','Zelvara','Chiavezzo','Corzara','Delvara','Fenezzo','Lucchezzo','Morvezzo','Nuvara','Orvezzo','Prazara','Scavezzo','Tezzara','Ulvara','Venzara','Zanchezzo','Bravara','Cirezzo','Isvara','Mavezzo','Chazara']},
};

/** Varkand unit call signs given in National Service (canon: Dask "Lantern" Voren). */
export const varkandCallSigns:readonly string[]=['Anchor','Bulwark','Cinder','Driftwood','Flint','Gannet','Harrow','Ironhook','Jackdaw','Keel','Ledger','Marsh','Nightjar','Outrider','Peat','Quarry','Rook','Signal','Tallow','Undertow','Vane','Wick','Beacon','Chisel','Dunlin','Fogbell','Gravel','Heron','Kestrel','Moth','Ratchet','Tern'];

const pick=<T,>(list:readonly T[],n:number)=>list[((n%list.length)+list.length)%list.length];

/** Deterministic display name for AI citizen number `seed` of a nation, in that nation's public form. */
export function citizenName(nation:CitizenNation,seed:number):string{
 const s=Math.floor(Math.abs(seed)),{given,family}=citizenNameLists[nation];
 const g=pick(given,s),f=pick(family,Math.floor(s/given.length)+s*7);
 switch(nation){
  case 'meridian':return `${g} ${f}-${1+(s%9)}`;
  case 'korund':return `${f} ${g} · Brigade ${10+(s%90)}`;
  case 'varkand':return `${g} "${pick(varkandCallSigns,s*3+1)}" ${f}`;
  default:return `${g} ${f}`;
 }
}
