import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {supportedBands, heightSummary, heightContrast, heightProfile} from '../3d/research.js';

test('sparse and suppressed groups cannot become vertical support or a zero contrast',()=>{
  const r={n:80,h_agl:{min:2,max:28},bands:[
    {lo:0,hi:10,n:40,series:[0,1,null,4]},
    {lo:10,hi:20,n:19,series:[0,2,3,4]},
    {lo:20,hi:30,n:21,series:[0,4,5,null]}
  ]};
  assert.equal(supportedBands(r).length,2);
  assert.deepEqual(heightContrast(r).series,[0,3,null,null]);
  assert.equal(heightSummary(r,{height_agl:45}).publishedPoints,61);
  assert.equal(heightSummary(null,{height_agl:45}).highest,null);
  assert.equal(heightSummary(null,{height_agl:45}).points,null,'suppressed or missing groups must not imply zero radar points');
  assert.equal(heightContrast({bands:[r.bands[0]]}),null);
  assert.equal(heightContrast(null),null);
  assert.equal(heightContrast({bands:[{lo:0,hi:10,n:20,series:[]},{lo:10,hi:20,n:20,series:[]}]}),null);
  assert.match(heightProfile(null,{height_agl:45},()=> '#000'),/No publishable radar group/);
});

test('both public processings have consistent geometry IDs and honest height contrasts',()=>{
  let order;
  for(const base of ['2020-2026-ground/','']) {
    const d=JSON.parse(fs.readFileSync(new URL('../data/'+base+'buildings.json',import.meta.url),'utf8'));
    const epochs=JSON.parse(fs.readFileSync(new URL('../data/'+base+'epochs.json',import.meta.url),'utf8'));
    if(order) assert.deepEqual(d.order,order,'mesh row identifiers must remain identical on a dataset switch');
    order=d.order;
    assert.equal(new Set(order).size,46);
    for(const id of order) {
      assert.match(id,/^\d{16}$/);
      const r=d.buildings[id], a=d.bag3d[id], summary=heightSummary(r,a,d.min_n);
      assert.ok(summary.publishedPoints<=summary.points,'published slab counts must not imply extra radar points');
      if(!r) {assert.equal(heightContrast(r),null);continue;}
      const contrast=heightContrast(r,d.min_n);
      assert.ok(supportedBands(r,d.min_n).every(b=>b.n>=20));
      if(contrast) {
        assert.equal(contrast.series.length,epochs.n_epochs);
        for(let i=0;i<contrast.series.length;i++) assert.equal(contrast.series[i],contrast.high.series[i]-contrast.low.series[i]);
      }
      const svg=heightProfile(r,a,()=> '#123456',d.min_n);
      assert.doesNotMatch(svg,/NaN|undefined|Infinity/);
      assert.ok(svg.includes('highest retained point: '+r.h_agl.max.toFixed(1)+' m'));
    }
  }
});
