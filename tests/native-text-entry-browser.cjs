// Simulates native host marker, tests prompt contracts without inspecting licensed pixels.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE),assert=require('node:assert/strict');
(async()=>{let cases=0;for(const engine of ['chromium','webkit']){const b=await({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});try{for(const viewport of [{width:390,height:844},{width:844,height:390}]){
 const c=await b.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'});await c.addInitScript(()=>{window.webkit.messageHandlers.partyState={postMessage:()=>{}};window.webkit.messageHandlers.partyTextEntry={postMessage: body => new Promise((resolve,reject)=>{window.__entryCount=(window.__entryCount||0)+1;window.__entry={body,resolve,reject}})};setInterval(()=>window.__ticks=(window.__ticks||0)+1,50);if(!localStorage.sg_v1_profile)localStorage.sg_v1_profile=JSON.stringify({version:1,language:'zh',muted:true,onboardingSeen:true,players:[{id:'original',name:'Stephen',team:0}],custom:['原有詞'],settings:{mode:'individual',surface:'canvas',topic:'mixed',difficulty:'easy',cardLanguage:'both',seconds:60,roundsEach:1}})});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));const profile=()=>p.evaluate(()=>JSON.parse(localStorage.sg_v1_profile));
 const enter=async(kind,value)=>{await p.locator(`[data-action="add-text-entry"][data-kind="${kind}"]`).click();await p.waitForFunction(()=>!!window.__entry);await p.evaluate(value=>{const entry=window.__entry;window.__entry=null;entry.resolve({cancelled:value===null,value:value||''})},value);await p.waitForTimeout(50);};
 await p.goto(process.env.TEST_URL);await p.locator('[data-action="setup"]').click();assert.equal(await p.locator('input:not([type=file]):not([type=checkbox]),textarea').count(),0);
 await p.locator('[data-action="add-text-entry"][data-kind="player"]').click();
 await p.waitForFunction(()=>!!window.__entry);await p.locator('[data-action="add-text-entry"][data-kind="player"]').click();assert.equal(await p.evaluate(()=>window.__entryCount),1);const ticks=await p.evaluate(()=>window.__ticks);await p.waitForTimeout(3200);assert.ok(await p.evaluate(ticks=>window.__ticks>ticks+20,ticks));
 await p.evaluate(()=>{window.__entry.resolve({cancelled:true,value:''});window.__entry=null});await p.waitForTimeout(50);
 await p.locator('[data-action="add-text-entry"][data-kind="player"]').click();await p.waitForFunction(()=>!!window.__entry);await p.evaluate(()=>{__entry.reject(Error('unavailable'));window.__entry=null});await p.waitForTimeout(50);
 await enter('player',null);await enter('player','   ');assert.equal((await profile()).players.length,1);
 await enter('player','  小明  ');assert.equal((await profile()).players[1].name,'小明');assert.equal((await profile()).settings.mode,'coop');await enter('player','小明');assert.equal((await profile()).players.length,2);
 await enter('player','<Alice & Bob>');assert.equal((await profile()).players[2].name,'<Alice & Bob>');assert.equal((await profile()).settings.mode,'individual');
 await enter('player','長'.repeat(25));assert.equal((await profile()).players[3].name.length,20);
 assert.equal((await profile()).players[0].id,'original');await p.reload();await p.locator('[data-action="words"]').first().click();assert.equal(await p.locator('input:not([type=file]):not([type=checkbox]),textarea').count(),0);
 await enter('word',null);await enter('word',' ');assert.deepEqual((await profile()).custom,['原有詞']);
 await enter('word','  雪糕  車  ');await enter('word','雪糕 車');assert.deepEqual((await profile()).custom,['原有詞','雪糕 車']);
 await enter('word','詞'.repeat(35));assert.equal((await profile()).custom.at(-1).length,30);
 await p.reload();assert.deepEqual((await profile()).custom.slice(0,2),['原有詞','雪糕 車']);assert.equal((await profile()).players.length,4);assert.deepEqual(errors,[]);await c.close();cases++;
 }}finally{await b.close();}}console.log({cases});})().catch(e=>{console.error(e);process.exitCode=1});
