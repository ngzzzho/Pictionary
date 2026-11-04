import test from 'node:test';import assert from 'node:assert/strict';
import {penColors,defaultBrush} from '../js/brush-preferences.mjs';
test('12 colours and independent standard pen for every round',()=>{
 assert.equal(new Set(penColors).size,12);assert.ok(penColors.every(c=>/^#[0-9a-f]{6}$/.test(c)));
 const brush=defaultBrush();assert.deepEqual(brush,{color:'#243450',width:7,eraser:false});
 Object.assign(brush,{color:'#ebae35',width:14,eraser:true});
 assert.deepEqual(defaultBrush(),{color:'#243450',width:7,eraser:false});
});
