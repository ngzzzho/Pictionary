// Isolated profiles; no licensed pixel inspection. Native UIKit keyboard acceptance remains manual.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE);const assert=require('node:assert/strict');
(async()=>{let cases=0;for(const engine of ['chromium','webkit']){const b=await({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});try{for(const viewport of [{width:390,height:844},{width:844,height:390}]){
 const c=await b.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{if(!localStorage.sg_v1_profile)localStorage.sg_v1_profile=JSON.stringify({version:1,language:'zh',muted:true,onboardingSeen:true,players:[0,1,2,3].map(i=>({id:'p'+i,name:'Name'+i,team:i%2})),custom:['保留詞'],settings:{mode:'teams',surface:'canvas',topic:'mixed',difficulty:'easy',cardLanguage:'both',seconds:120,roundsEach:1}})});
 const rename=async(team,value,scope='profile')=>{let handled=false;p.once('dialog',async dialog=>{assert.equal(dialog.type(),'prompt');handled=true;if(value===null)await dialog.dismiss();else await dialog.accept(value)});await p.locator(`[data-action="rename-team"][data-team-scope="${scope}"][data-team-name="${team}"]`).click();assert.ok(handled);};
 await p.goto(process.env.TEST_URL);await p.locator('[data-action="setup"]').click();
 assert.equal(await p.locator('.team-name-editor input').count(),0);
 await rename(0,'火龍 <隊>');await rename(1,'Blue & Gold');await rename(1,null);
 assert.deepEqual(await p.locator('.team-badge').allTextContents(),['火龍 <隊>','Blue & Gold','火龍 <隊>','Blue & Gold']);
 await p.locator('[data-action="step"][data-step="3"]').click();await p.locator('[data-action="start-game"]').click();
 const original=await p.evaluate(()=>JSON.parse(localStorage.sg_v1_game));assert.deepEqual(original.settings.teamNames,['火龍 <隊>','Blue & Gold']);
 assert.equal(await p.locator('.team-chip').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 await p.locator('[data-action="scores"]').first().click();await rename(1,'海豚隊','game');assert.ok((await p.locator('.score-name').allTextContents()).includes('海豚隊'));
 await rename(1,null,'game');await p.locator('#scores-dialog [data-action="scores"]').click();
 const changed=await p.evaluate(()=>JSON.parse(localStorage.sg_v1_game));assert.deepEqual(changed.schedule,original.schedule);assert.deepEqual(changed.teamScores,original.teamScores);
 await p.reload();await p.locator('[data-action="resume-game"]').click();await p.locator('[data-action="scores"]').first().click();assert.ok((await p.locator('.score-name').allTextContents()).includes('海豚隊'));
 assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.sg_v1_profile).custom),['保留詞']);assert.deepEqual(errors,[]);await c.close();cases++;
 }}finally{await b.close();}}console.log({cases});})().catch(e=>{console.error(e);process.exitCode=1});
