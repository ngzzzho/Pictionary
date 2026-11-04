import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/core.mjs';
import {gameStorageAdapter,TIMER_KEY} from '../js/game-storage.mjs';
import {KEYS} from '../js/storage.mjs';
import {detectLocale} from '../js/languages.mjs';
const create=()=>{const g=G.newGame([{id:'a',name:'A',team:0},{id:'b',name:'B',team:1}],{mode:'coop',surface:'canvas',seconds:30,roundsEach:1,cardLanguage:'en'},Array.from({length:10},(_,i)=>({id:String(i),en:'word'+i,zh:'字'+i})),1000);G.reveal(g);G.start(g,1000);return g;};
function fixture(){const data=new Map(),writes=[];let fail=false;const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('full');data.set(k,v);writes.push({k,bytes:v.length});},removeItem:k=>data.delete(k)};return {data,writes,storage,setFail:v=>fail=v,store:gameStorageAdapter(storage)};}
test('timer checkpoint is small, reloads paused, and never rewrites complete ink each second',()=>{
 const f=fixture(),g=create();g.strokes=Array.from({length:100},()=>({color:'#000000',width:7,points:Array.from({length:100},()=>[.2,.3])}));
 assert.ok(G.validGame(g));f.store.write(KEYS.game,G.snapshot(g,1000));const raw=f.data.get(KEYS.game);
 for(let now=2000;now<=10000;now+=1000)assert.ok(f.store.checkpointTimer(g,now));
 assert.equal(f.data.get(KEYS.game),raw);assert.equal(f.writes.filter(w=>w.k===KEYS.game).length,1);assert.ok(f.writes.filter(w=>w.k===TIMER_KEY).every(w=>w.bytes<500));
 const restored=gameStorageAdapter(f.storage).read(KEYS.game,G.validGame);assert.equal(restored.timer.msLeft,21000);assert.equal(restored.timer.running,false);assert.deepEqual(restored.strokes,g.strokes);
});
test('stale, malformed, increased, cross-turn and restored-backup timers cannot replace authoritative state',()=>{
 const f=fixture(),g=create();f.store.write(KEYS.game,G.snapshot(g,1000));f.store.checkpointTimer(g,4000);const old=f.data.get(TIMER_KEY);
 f.store.write(KEYS.game,G.snapshot(g,5000));f.data.set(TIMER_KEY,old);assert.equal(gameStorageAdapter(f.storage).read(KEYS.game,G.validGame).timer.msLeft,26000);
 const base=JSON.parse(f.data.get(KEYS.game));for(const patch of [{msLeft:999999},{msLeft:-1},{msLeft:null},{turn:999},{id:'another'},{revision:'stale'}]){f.data.set(TIMER_KEY,JSON.stringify({revision:base.checkpointRevision,id:g.id,turn:g.turn,duration:g.timer.duration,msLeft:1,...patch}));assert.equal(gameStorageAdapter(f.storage).read(KEYS.game,G.validGame).timer.msLeft,26000);}
 f.data.set(TIMER_KEY,'{bad');assert.ok(gameStorageAdapter(f.storage).read(KEYS.game,G.validGame));
 const backup=G.snapshot(base);assert.equal(backup.checkpointRevision,undefined);f.data.set(KEYS.game,JSON.stringify(backup));f.data.set(TIMER_KEY,old);assert.equal(gameStorageAdapter(f.storage).read(KEYS.game,G.validGame).timer.msLeft,26000);
});
test('failed full write disables checkpoints; failed timer write retains last complete save and custom/profile data',()=>{
 const f=fixture(),g=create();f.data.set(KEYS.profile,'keep custom and names');f.store.write(KEYS.game,G.snapshot(g,1000));const raw=f.data.get(KEYS.game);
 f.setFail(true);assert.equal(f.store.checkpointTimer(g,2000),false);assert.equal(f.store.write(KEYS.game,G.snapshot(g,3000)),false);f.setFail(false);assert.equal(f.store.checkpointTimer(g,4000),false);assert.equal(f.data.get(KEYS.game),raw);assert.equal(f.data.get(KEYS.profile),'keep custom and names');
});
test('undo restores sub-second and zero remainder without a time bonus',()=>{
 for(const ms of [200,0]){const g=create();G.end(g,ms?'correct':'timeout','b',31000-ms);assert.ok(G.undo(g));assert.equal(g.timer.msLeft,ms);assert.ok(G.validGame(g));if(ms===0){assert.equal(G.resume(g),false);assert.ok(G.end(g,'timeout'));}}
});
test('new English preference uses selectable regional choices without rewriting saved legacy values',()=>{for(const tag of ['en-HK','en-AU','en-NZ','en-SG'])assert.equal(detectLocale([tag]),'en-GB');assert.equal(detectLocale(['en']),'en-US');assert.equal(detectLocale(['en-GB']),'en-GB');});
test('legacy saves work without timer metadata and optional UUID support; handoff snapshots stay byte-stable',()=>{
 const f=fixture(),g=create();f.data.set(KEYS.game,JSON.stringify(G.snapshot(g,1000)));
 assert.equal(f.store.read(KEYS.game,G.validGame).timer.msLeft,30000);
 assert.equal(f.store.checkpointTimer(g,2000),false);
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 try{Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});assert.ok(f.store.write(KEYS.game,G.snapshot(g,1000)));assert.ok(f.store.checkpointTimer(g,2000));assert.equal(f.store.read(KEYS.game,G.validGame).timer.msLeft,29000);}finally{Object.defineProperty(globalThis,'crypto',descriptor);}
 G.end(g,'giveup',null,2000);G.next(g);const handoff=G.snapshot(g);f.store.write(KEYS.game,handoff);assert.equal(f.data.get(KEYS.game),JSON.stringify(handoff));
});
