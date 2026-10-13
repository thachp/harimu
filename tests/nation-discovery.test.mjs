import assert from 'node:assert/strict';
import {test} from 'node:test';
import {discoverNations,nationFamilies,nationIsPreview,nationLensLabel} from '../lib/nation-discovery.ts';
const ids=['kindle','confluence','meridian','korund','aurelle','ilmar','hoarvale','varkand','veldwood','fulmara'];
const nations=ids.map(id=>({id}));
test('all ten reachable through families and reset without changing input selection',()=>{assert.deepEqual(discoverNations(nations,'all','power'),nations);const reached=new Set();for(const family of nationFamilies.slice(1))for(const nation of discoverNations(nations,family.id,'power'))reached.add(nation.id);assert.equal(reached.size,10);const selected='korund';assert.ok(!discoverNations(nations,'democracies','power').some(n=>n.id===selected));assert.equal(selected,'korund');assert.deepEqual(nations.map(n=>n.id),ids);});
test('money and faith deterministically reorder same ten using GDD groupings',()=>{const expected=['kindle','hoarvale','veldwood','fulmara','confluence','meridian','varkand','aurelle','ilmar','korund'];for(const lens of ['money','faith'])assert.deepEqual(discoverNations(nations,'all',lens).map(n=>n.id),expected);assert.equal(nationLensLabel('korund','money'),'No market money');assert.equal(nationLensLabel('ilmar','faith'),'State faith');});
test('seven unfinished economies carry preview status',()=>{assert.equal(ids.filter(nationIsPreview).length,7);for(const id of ['kindle','korund','aurelle'])assert.equal(nationIsPreview(id),false);});
