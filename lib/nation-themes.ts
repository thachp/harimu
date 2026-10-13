/** Public presentation tokens. These never change citizenship or nation rules. */
export const nationThemes = {
 kindle:{name:'Kindle',document:'Civic form',symbol:'▣',motif:'Ruled civic form',paper:'#f1eddc',ink:'#18343e',accent:'#246c60',edge:'#7c9189',pattern:'repeating-linear-gradient(0deg, transparent 0 27px, #18343e0d 27px 28px)'},
 korund:{name:'Korund',document:'Ration booklet',symbol:'▦',motif:'Stamped grid booklet',paper:'#3b2325',ink:'#f6ead3',accent:'#d7bb8a',edge:'#a98068',pattern:'repeating-linear-gradient(90deg, transparent 0 15px, #d7bb8a0c 15px 16px)'},
 aurelle:{name:'Aurelle',document:'Royal scroll',symbol:'◇',motif:'Double border and crown seal',paper:'#352846',ink:'#f5e8cd',accent:'#d9bd83',edge:'#aa926a',pattern:'repeating-linear-gradient(135deg, transparent 0 17px, #d9bd830b 17px 18px)'},
} as const;
export function nationTheme(nationId:string){return Object.hasOwn(nationThemes,nationId)?nationThemes[nationId as keyof typeof nationThemes]:null;}
