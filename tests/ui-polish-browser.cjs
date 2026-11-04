const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {})});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}, serviceWorkers:'block', reducedMotion:'reduce'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.feedbackEvents = [];
      window.webkit = {messageHandlers:{partyFeedback:{postMessage:k=>window.feedbackEvents.push(k)}}};
    });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8766/');
    const click = action => page.locator(`[data-action="${action}"]`).first().click();
    assert.equal(await page.locator('.session-preview span').count(),3);
    assert.equal(await page.locator('.hero-actions .primary').count(),1);
    await click('quick'); await click('intro-start'); await click('reveal'); await click('draw');
    await click('judge'); await click('correct');
    assert.equal(await page.locator('.score-details').getAttribute('open'),null);
    assert.ok(await page.locator('.score-gain').textContent());
    assert.equal(await page.locator('.result-correct').evaluate(el=>getComputedStyle(el).animationName),'none');
    page.once('dialog', dialog => dialog.accept()); await click('finish');
    assert.ok(await page.locator('.replay-actions').evaluate(el=>el.getBoundingClientRect().top < document.querySelector('.recap-row').getBoundingClientRect().top));
    const events = await page.evaluate(()=>window.feedbackEvents);
    assert.ok(events.includes('go')); assert.ok(events.includes('correct')); assert.ok(events.includes('complete'));
    await click('replay');
    assert.equal(await page.locator('.handoff-stage').count(),1);
    assert.equal(await page.evaluate(()=>scrollY),0);
    await click('sound');
    const count = await page.evaluate(()=>window.feedbackEvents.length);
    await click('reveal'); await click('draw');
    assert.equal(await page.evaluate(()=>window.feedbackEvents.length),count);
    assert.deepEqual(errors,[]);
    console.log('PASS: primary action, session context, result hierarchy, reduced motion, early replay, fresh handoff, feedback routing and mute');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
