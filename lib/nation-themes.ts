/** Public presentation tokens. These never change citizenship or nation rules. */
export const nationThemes = {
 kindle:{name:'Kindle',document:'Civic form',symbol:'▣',motif:'Ruled civic form',paper:'#f1eddc',ink:'#18343e',accent:'#246c60',edge:'#7c9189',pattern:'repeating-linear-gradient(0deg, transparent 0 27px, #18343e0d 27px 28px)'},
 korund:{name:'Korund',document:'Ration booklet',symbol:'▦',motif:'Stamped grid booklet',paper:'#3b2325',ink:'#f6ead3',accent:'#d7bb8a',edge:'#a98068',pattern:'repeating-linear-gradient(90deg, transparent 0 15px, #d7bb8a0c 15px 16px)'},
 aurelle:{name:'Aurelle',document:'Royal scroll',symbol:'◇',motif:'Double border and crown seal',paper:'#352846',ink:'#f5e8cd',accent:'#d9bd83',edge:'#aa926a',pattern:'repeating-linear-gradient(135deg, transparent 0 17px, #d9bd830b 17px 18px)'},
} as const;
export function nationTheme(nationId:string){return Object.hasOwn(nationThemes,nationId)?nationThemes[nationId as keyof typeof nationThemes]:null;}

/** #79: a color-blind-safe identity mark for every nation (symbol shape + fill pattern + a light accent), shown next to nation names on the globe, the nation strip
 *  and the comparison table. This is separate from `nationThemes` (document skins for three nations) so adding marks never re-skins a document.
 *  Rule: no two nations share a symbol or a pattern, so no pair is told apart by hue alone (checked under deuteranopia, protanopia and tritanopia in tests/nation-marks.test.mjs).
 *  `pattern` is a token styled in app/game-shell.css via [data-nation-pattern]. `accent` is for the dark game UI. */
export const nationMarks = {
 kindle:{name:'Kindle Republic',symbol:'▣',pattern:'ruled',patternName:'ruled lines',accent:'#cda65b'},
 confluence:{name:'The Confluence',symbol:'◐',pattern:'waves',patternName:'waves',accent:'#579ab5'},
 meridian:{name:'Meridian',symbol:'▲',pattern:'crosshatch',patternName:'crosshatch',accent:'#b88cac'},
 korund:{name:'Korund',symbol:'▦',pattern:'grid',patternName:'grid',accent:'#aabbb3'},
 aurelle:{name:'Aurelle',symbol:'◇',pattern:'diagonal',patternName:'diagonal stripes',accent:'#d0ad54'},
 ilmar:{name:'Ilmar',symbol:'⬢',pattern:'dots',patternName:'dots',accent:'#e0bb59'},
 hoarvale:{name:'Hoarvale',symbol:'✚',pattern:'chevrons',patternName:'chevrons',accent:'#8ac1c6'},
 varkand:{name:'Varkand',symbol:'◆',pattern:'checks',patternName:'checks',accent:'#a6a078'},
 veldwood:{name:'Veldwood',symbol:'❖',pattern:'reverse-diagonal',patternName:'reverse diagonal stripes',accent:'#96b66d'},
 fulmara:{name:'Fulmara',symbol:'✦',pattern:'vertical',patternName:'vertical stripes',accent:'#b598d3'},
} as const;
export type NationMark=(typeof nationMarks)[keyof typeof nationMarks];
export function nationMark(nationId:string):NationMark|null{return Object.hasOwn(nationMarks,nationId)?nationMarks[nationId as keyof typeof nationMarks]:null;}
/** "Kindle Republic symbol, ruled lines" - the text alternative for a mark whose glyph is shown on its own. */
export function nationMarkLabel(nationId:string){const mark=nationMark(nationId);return mark?`${mark.name} symbol, ${mark.patternName}`:null;}
/** Build-time flag (NEXT_PUBLIC_HARIMU_NATION_SYMBOLS): the symbol chips ship off until QA turns them on. Only the exact string "true" enables them. */
export function nationSymbolsEnabled(value:string|undefined=process.env.NEXT_PUBLIC_HARIMU_NATION_SYMBOLS){return value==='true';}
