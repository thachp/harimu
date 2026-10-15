import {isLiveNation} from './playable-nations';
export type DiscoveryNation = {id:string;name:string;government?:string;economy?:string;currency?:string;religion?:string};
/** The ten nations always show in default order; the discovery filter and sort rows were removed. A nation is a preview until its economy is playable. */
export function nationIsPreview(id:string){return !isLiveNation(id);} // #485: reads the shared playable list
