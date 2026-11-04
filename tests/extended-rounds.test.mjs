import test from 'node:test';import assert from 'node:assert/strict';import * as G from '../js/core.mjs';import {validProfile,defaults} from '../js/profile.mjs';import {freeSettings} from '../js/access.mjs';
const players=n=>Array.from({length:n},(_,i)=>({id:String(i),name:'P'+i,team:i%2}));
const words=Array.from({length:250},(_,i)=>({id:String(i),en:'Word'+i,zh:'詞'+i}));
test('5 and 10 rounds retain settings, complete schedules and save validity',()=>{
 for(const n of [2,5,12])for(const roundsEach of [5,10])for(const mode of n===2?['coop']:['individual','teams']){
 const roster=players(n),settings={...defaults,mode,roundsEach,drawPolicy:'unique'};
 assert.equal(validProfile({version:1,language:'en',muted:true,players:roster,custom:[],settings}),true);
 const g=G.newGame(roster,settings,words,1000);const length=mode==='teams'?Math.ceil(n/2)*2*roundsEach:n*roundsEach;
 assert.equal(g.schedule.length,length);assert.equal(G.validGame(G.snapshot(g)),true);
 for(let i=0;i<length;i++){G.reveal(g);G.start(g,1000);G.end(g,'giveup',null,1100);G.next(g)}
 assert.equal(g.finished,true);assert.equal(g.history.length,length);assert.equal(G.validGame(G.snapshot(g)),true);
 }
});
test('free downgrade uses offered options and reserves one replacement per turn',()=>{
 for(let n=2;n<=12;n++)for(const roundsEach of [1,2,3,5,10]){
 const settings=freeSettings({...defaults,roundsEach},players(n));
 assert.ok([1,2,3,5,10].includes(settings.roundsEach));assert.ok(G.scheduleFor(players(n),settings.mode,settings.roundsEach).length*2<=50);
 }
 assert.equal(freeSettings({...defaults,roundsEach:10},players(2)).roundsEach,10);
 assert.equal(freeSettings({...defaults,roundsEach:10},players(6)).roundsEach,3);
});
