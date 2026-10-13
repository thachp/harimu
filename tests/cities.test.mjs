import assert from 'node:assert/strict';
import { test } from 'node:test';
import { citiesForNation, cityForNation, capitalCityForNation } from '../lib/cities.ts';
const ids=['kindle','confluence','meridian','korund','aurelle','ilmar','hoarvale','varkand','veldwood','fulmara'];
test('each nation has one capital and two canonical destinations with stable unique slugs',()=>{
 const all=[];for(const id of ids){const cities=citiesForNation(id);assert.equal(cities.length,3);assert.equal(cities.filter(c=>c.capital).length,1);assert.equal(capitalCityForNation(id),cities[0]);for(const c of cities){assert.match(c.id,/^[a-z]+(?:-[a-z]+)*$/);assert.equal(cityForNation(id,c.id),c);assert.ok(c.description);all.push(c.id);}}
 assert.equal(new Set(all).size,30);assert.equal(capitalCityForNation('fulmara').name,'Arcport');assert.equal(cityForNation('kindle','kolt-savanna').name,'Kolt Savanna');
});
test('foreign and unknown destinations fail closed',()=>{assert.equal(cityForNation('kindle','arcport'),undefined);assert.equal(cityForNation('unknown','forgehaven'),undefined);assert.deepEqual(citiesForNation('unknown'),[]);assert.equal(capitalCityForNation('unknown'),undefined);});
