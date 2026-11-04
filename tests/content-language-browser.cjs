// Isolated synthetic saves, DOM only; no user data or licensed pixels inspected.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const G=await import('../js/core.mjs'),{defaults}=await import('../js/profile.mjs'),{cardLines}=await import('../js/localization.mjs');
 const read=p=>JSON.parse(fs.readFileSync(p));const now=read('js/content.json'),old=read('scripts/content-language-baseline.json'),policy=read('scripts/content-language-review.json');
 const records=[];
 await Promise.all(['chromium','webkit'].map(async engine=>{
 const browser=await ({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{for(const [width,height] of [[390,844],[844,390]]){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'});
 for(const [edition,bank] of [['new',now],['old',old]])for(const id of Object.keys(policy.entries))for(const selection of (edition==='new'?['en-US+en-GB','zh+zh-TW','pt-BR+pt-PT','es-ES+es-MX']:['es-ES+zh-TW'])){
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const players=[{id:'a',name:'家人',team:0},{id:'b',name:'Friend',team:1}],settings={...defaults,mode:'coop',roundsEach:1,cardLanguage:selection};
 const target=bank.words.find(w=>w.id===id),game=G.newGame(players,settings,[target,...bank.words.filter(w=>w.id!==id&&w.review!=='held').slice(0,5)]);
 game.deck.sort((a,b)=>(a.id===id?-1:b.id===id?1:0));G.reveal(game);
 const profile={version:1,language:'en-US',muted:true,onboardingSeen:true,players,custom:['KEEP 自訂詞'],settings};
 await page.addInitScript(({profile,game})=>{localStorage.setItem('sg_v1_profile',JSON.stringify(profile));localStorage.setItem('sg_v1_game',JSON.stringify(game));},{profile,game});
 await page.goto(process.env.TEST_URL);await page.locator('[data-action="resume-game"]').click();await page.locator('.word-card .card-line bdi').first().waitFor();
 assert.deepEqual(await page.locator('.word-card .card-line bdi').allTextContents(),cardLines(target,selection).map(l=>l.text));
 const geometry=await page.locator('.word-card').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+2,right:el.getBoundingClientRect().right,screen:innerWidth}));
 assert.ok(!geometry.overflow&&geometry.right<=geometry.screen+2,JSON.stringify({engine,id,selection,geometry}));
 const saved=await page.evaluate(()=>({game:JSON.parse(localStorage.sg_v1_game),profile:JSON.parse(localStorage.sg_v1_profile)}));
 assert.deepEqual(saved.game.word,target);assert.deepEqual(saved.profile.custom,profile.custom);assert.deepEqual(errors,[]);
 records.push({engine,width,edition,id,selection});await page.close();
 }
 await context.close();}
 }finally{await browser.close();}}));
 fs.writeFileSync(process.env.RECEIPT,JSON.stringify({records,failures:0},null,2));console.log({cases:records.length,failures:0});
})().catch(e=>{console.error(e);process.exitCode=1;});
