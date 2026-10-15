import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nationIsPreview} from '../lib/nation-discovery.ts';
const ids=['kindle','confluence','meridian','korund','aurelle','ilmar','hoarvale','varkand','veldwood','fulmara'];
test('seven unfinished economies carry preview status',()=>{assert.equal(ids.filter(nationIsPreview).length,7);for(const id of ['kindle','korund','aurelle'])assert.equal(nationIsPreview(id),false);});
