import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCityWorld } from '../lib/game-art.ts';
test('visited city labels replace the capital name while keeping the national layout and destination identities',()=>{
 const capital=createCityWorld('kindle');const town=createCityWorld('kindle','Tarrek Foundry');
 assert.equal(town.buildings.find(b=>b.location==='square').label,'Tarrek Foundry square');
 assert.equal(town.buildings.find(b=>b.location==='workplace').label,'Tarrek Foundry work yard');
 assert.equal(town.buildings.find(b=>b.location==='market').label,'Tarrek Foundry market');
 assert.deepEqual(town.buildings.map(b=>[b.location,b.position.toArray()]),capital.buildings.map(b=>[b.location,b.position.toArray()]));
 assert.equal(town.buildings.find(b=>b.location==='home').label,'Your household');
 assert.equal(town.buildings.find(b=>b.location==='government').label,'Assembly hall');
});
test('default capital and Korund-specific service labels remain correct',()=>{
 assert.equal(createCityWorld('kindle').buildings.find(b=>b.location==='square').label,'Forgehaven square');
 const town=createCityWorld('korund','Gren Plateau');
 assert.equal(town.buildings.find(b=>b.location==='square').label,'Gren Plateau square');
 assert.equal(town.buildings.find(b=>b.location==='workplace').label,'Assignment board');
 assert.equal(town.buildings.find(b=>b.location==='market').label,'State ration store');
});
