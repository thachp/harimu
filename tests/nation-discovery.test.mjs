import assert from 'node:assert/strict';
import {test} from 'node:test';
import {localRuntime} from './helpers/local-runtime.mjs';
const {nationIsPreview} = await (async()=>{const r=await localRuntime();try{return await r.importModule('lib/nation-discovery.ts');}finally{await r.close();}})(); // reads the shared playable list (#485)
const ids=['kindle','confluence','meridian','korund','aurelle','ilmar','hoarvale','varkand','veldwood','fulmara'];
test('seven unfinished economies carry preview status',()=>{assert.equal(ids.filter(nationIsPreview).length,7);for(const id of ['kindle','korund','aurelle'])assert.equal(nationIsPreview(id),false);});
