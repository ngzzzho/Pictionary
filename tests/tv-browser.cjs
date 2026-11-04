// Isolated synthetic data and native-bridge mocks. No licensed pixel inspection.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const fs = require("node:fs"),
  assert = require("node:assert/strict");
(async () => {
  const G = await import("../js/core.mjs"),
    { defaults } = await import("../js/profile.mjs");
  const profile = {
    version: 1,
    language: "en",
    muted: true,
    onboardingSeen: true,
    players: [
      { id: "p1", name: "PRIVATE_NAME_ALPHA", team: 0 },
      { id: "p2", name: "PRIVATE_NAME_BETA", team: 1 },
    ],
    custom: [
      "PRIVATE_WORD_ALPHA",
      "PRIVATE_WORD_BETA",
      "PRIVATE_WORD_GAMMA",
      "PRIVATE_WORD_DELTA",
      "PRIVATE_WORD_EPSILON",
    ],
    settings: {
      ...defaults,
      mode: "coop",
      surface: "canvas",
      topic: "custom",
      seconds: 60,
      roundsEach: 1,
    },
  };
  const deck = profile.custom.map((w, i) => ({
      id: "custom" + i,
      en: w,
      zh: w,
    })),
    game = G.newGame(profile.players, profile.settings, deck);
  const records = [];
  for (const engine of ["chromium", "webkit"]) {
    const b = await (engine === "webkit" ? webkit : chromium).launch({
      headless: true,
      ...(engine === "chromium" && process.env.CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
        : {}),
    });
    try {
      const c = await b.newContext({
          viewport: { width: 390, height: 844 },
          serviceWorkers: "block",
          reducedMotion: "reduce",
        }),
        p = await c.newPage();
      await p.addInitScript(
        ({ profile, game }) => {
          localStorage.sg_v1_profile = JSON.stringify(profile);
          localStorage.sg_v1_game = JSON.stringify(game);
          window.__entry = null;
          const T = (window.__tv = {
            s: {
              available: true,
              enabled: false,
              connected: false,
              privateAllowed: false,
              resetRequired: true,
              epoch: 1,
              reason: "background",
            },
            frames: [],
            acks: [],
            captured: false,
            backgrounded: true,
            starting: true,
            rejectAck: 0,
          });
          const send = () =>
            window.dispatchEvent(
              new CustomEvent("party-tv-status", {
                detail: structuredClone(T.s),
              }),
            );
          T.change = (values) => {
            Object.assign(T.s, values, {
              epoch: T.s.epoch + 1,
              privateAllowed: false,
              resetRequired: true,
            });
            send();
          };
          T.connect = () =>
            T.change({ connected: true, reason: "reconnecting" });
          T.disconnect = () =>
            T.change({ connected: false, reason: "waiting" });
          T.capture = (on) => {
            T.captured = on;
            T.change({ reason: on ? "captured" : "reconnecting" });
          };
          T.background = (on) => {
            T.backgrounded = on;
            T.change({ reason: on ? "background" : "reconnecting" });
          };
          window.webkit = {
            messageHandlers: {
              partyTV: {
                postMessage: async (m) => {
                  if (m.action === "status" && T.starting) {
                    T.starting = false;
                    setTimeout(() => {
                      T.backgrounded = false;
                      T.change({ reason: "reconnecting" });
                    }, 50);
                  }
                  if (m.action === "enable")
                    T.change({
                      enabled: m.enabled,
                      reason: m.enabled ? "waiting" : "off",
                    });
                  if (m.action === "ack" && m.epoch === T.s.epoch) {
                    T.acks.push({
                      epoch: m.epoch,
                      neutral: !!document.querySelector(".screen-tv-safe"),
                      privateText: /PRIVATE_WORD_|PRIVATE_NAME_/.test(
                        document.body.textContent,
                      ),
                    });
                    if (T.rejectAck) {
                      T.rejectAck--;
                      throw Error("Temporary bridge interruption");
                    }
                    const safe =
                      !T.captured &&
                      !T.backgrounded &&
                      (!T.s.enabled || T.s.connected);
                    if (safe) {
                      T.s.resetRequired = false;
                      T.s.privateAllowed = true;
                      T.s.reason = T.s.enabled ? "connected" : "off";
                    }
                    send();
                  }
                  if (m.action === "frame") {
                    T.frames.push(structuredClone(m.frame));
                    if (
                      m.frame.epoch !== T.s.epoch ||
                      T.s.resetRequired ||
                      !T.s.privateAllowed
                    )
                      throw Error("unsafe or stale frame");
                  }
                  return structuredClone(T.s);
                },
              },
            },
          };
        },
        { profile, game },
      );
      await p.addInitScript(() => {
        window.webkit.messageHandlers.partyState = {postMessage:()=>{}};
        window.webkit.messageHandlers.partyTextEntry = {postMessage:body => new Promise(resolve => {window.__entry={body,resolve};})};
      });
      await p.goto(process.env.TEST_URL);
      await p.locator('[data-action="quick"]').waitFor();
      assert.equal(await p.locator('[data-action="tv-continue"]').count(), 0);
      assert.equal(await p.locator(".screen-tv-safe").count(), 0);
      const click = (a) => p.locator(`[data-action="${a}"]`).first().click();
      await p.evaluate(() => __tv.background(true));
      await p.locator(".screen-tv-safe").waitFor();
      await p.evaluate(() => __tv.background(false));
      await p.locator('[data-action="quick"]').waitFor();
      assert.equal(await p.locator('[data-action="tv-continue"]').count(), 0);
      const checkFloating = async () => {
        for (const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390}]) {
          await p.setViewportSize(viewport);
          await p.waitForTimeout(150);
          const geometry = await p.evaluate(() => {
            const tray=document.querySelector('.tv-actions').getBoundingClientRect();
            const panel=document.querySelector('.tv-panel').getBoundingClientRect();
            return {top:tray.top,bottom:tray.bottom,panelBottom:panel.bottom,height:innerHeight,
              buttons:[...document.querySelectorAll('.tv-actions button')].map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}})};
          });
          assert.ok(geometry.top >= 0 && geometry.bottom <= geometry.height+1, JSON.stringify(geometry));
          assert.ok(geometry.panelBottom <= geometry.top+1, JSON.stringify(geometry));
          for(const button of geometry.buttons) assert.ok(button.top>=0 && button.bottom<=geometry.height+1 && button.left>=0 && button.right<=viewport.width+1);
        }
        await p.setViewportSize({width:390,height:844});
      };
      await click("tv");
      await checkFloating();
      assert.equal(await p.locator(".tv-guide li").count(), 4);
      assert.equal(await p.locator(".tv-mirror-icon").count(), 1);
      await click("tv-enable");
      await p.locator(".screen-tv-safe .tv-guide").waitFor();
      await checkFloating();
      await click("tv-disable");
      await p.locator('[data-action="quick"]').waitFor();
      assert.equal(await p.locator('[data-action="tv-continue"]').count(), 0);
      await click("tv");
      await click("tv-enable");
      await p.locator(".screen-tv-safe").waitFor();
      assert.equal(await p.locator('[data-action="reveal"]').count(), 0);
      await p.evaluate(() => __tv.connect());
      await p.locator('[data-action="tv-continue"]').waitFor();
      await click("tv-continue");
      await click("tv-back");
      await click("setup");
      await click("add-text-entry");
      await p.waitForFunction(()=>!!window.__entry);
      const beforeInput = await p.evaluate(()=>({frames:__tv.frames.length,epoch:__tv.s.epoch,acks:__tv.acks.length}));
      await p.waitForTimeout(3500);
      assert.ok(await p.evaluate(before=>__tv.frames.length>before.frames && __tv.s.epoch===before.epoch && __tv.acks.length===before.acks,beforeInput));
      await p.evaluate(()=>{__entry.resolve({cancelled:true,value:""});window.__entry=null});
      await click("add-text-entry");
      await p.waitForFunction(()=>!!window.__entry);
      const savedNames = await p.evaluate(()=>JSON.parse(localStorage.sg_v1_profile).players);
      await p.evaluate(()=>__tv.capture(true));
      await p.locator(".screen-tv-safe").waitFor();
      await p.evaluate(()=>{__entry.resolve({cancelled:false,value:"STALE_INPUT"});window.__entry=null});
      await p.waitForTimeout(100);
      assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.sg_v1_profile).players),savedNames);
      await p.evaluate(()=>__tv.capture(false));
      await p.locator('[data-action="tv-continue"]').waitFor();
      await click("tv-continue");
      await click("home");
      await click("resume-game");
      await click("reveal");
      const secret = await p.locator(".word-card").first().textContent();
      assert.match(secret, /PRIVATE_WORD_/);
      await p.waitForFunction(() => __tv.frames.at(-1)?.phase === "waiting");
      await click("draw");
      const box = await p.locator("#drawing-canvas").boundingBox();
      await p.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
      await p.mouse.down();
      await p.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, {
        steps: 15,
      });
      await p.waitForFunction(
        () =>
          __tv.frames.at(-1)?.phase === "drawing" &&
          __tv.frames.at(-1).strokes[0]?.points.length > 1,
      );
      const live = await p.evaluate(() => ({
        sent: __tv.frames.at(-1).strokes[0].points.length,
        saved: JSON.parse(localStorage.sg_v1_game).strokes.length,
      }));
      assert.equal(live.saved, 0);
      await p.mouse.up();
      await click("undo-stroke");
      await p.waitForFunction(
        () =>
          __tv.frames.at(-1)?.phase === "drawing" &&
          __tv.frames.at(-1).strokes.length === 0 && __tv.frames.at(-1).completedAnswer === "",
      );
      await click("redo-stroke");
      await p.waitForFunction(() => __tv.frames.at(-1)?.strokes.length === 1);
      const peek = await p.locator("#peek").boundingBox();
      await p.mouse.move(peek.x + peek.width / 2, peek.y + peek.height / 2);
      await p.mouse.down();
      assert.match(await p.locator("#peek").textContent(), /PRIVATE_WORD_/);
      const oldEpoch = await p.evaluate(() => __tv.s.epoch);
      await p.evaluate(() => __tv.disconnect());
      await p.locator(".screen-tv-safe").waitFor();
      assert.doesNotMatch(
        await p.locator("body").textContent(),
        /PRIVATE_WORD_|PRIVATE_NAME_/,
      );
      await p.mouse.up();
      let saved = await p.evaluate(() => JSON.parse(localStorage.sg_v1_game));
      assert.equal(saved.timer.running, false);
      assert.ok(saved.strokes.length);
      await p.evaluate(() => __tv.connect());
      await p.locator('[data-action="tv-continue"]').waitFor();
      assert.equal(await p.locator("#peek").count(), 0);
      await click("tv-continue");
      assert.equal(await p.locator('[data-action="uncover"]').count(), 0);
      assert.equal(await p.locator(".is-peeking").count(), 0);
      assert.equal(await p.locator(".pause-cover").count(), 0);
      await p.evaluate(() => __tv.capture(true));
      await p.locator(".screen-tv-safe").waitFor();
      await p.evaluate(
        (epoch) =>
          window.dispatchEvent(
            new CustomEvent("party-tv-status", {
              detail: {
                ...__tv.s,
                epoch,
                privateAllowed: true,
                resetRequired: false,
                reason: "connected",
              },
            }),
          ),
        oldEpoch,
      );
      assert.equal(await p.locator(".screen-tv-safe").count(), 1);
      assert.equal(await p.locator("#peek").count(), 0);
      await p.evaluate(() => {
        __tv.rejectAck = 1;
        __tv.capture(false);
      });
      await p.waitForFunction(() => __tv.rejectAck === 0);
      assert.equal(await p.locator(".screen-tv-safe").count(), 1);
      await click("tv-refresh");
      await p.locator('[data-action="tv-continue"]').waitFor();
      await click("tv-continue");
      assert.equal(await p.locator('[data-action="uncover"]').count(), 0);
      const clearEpoch = await p.evaluate(() => __tv.s.epoch);
      await click("clear-canvas");
      await p.locator("#clear-dialog").waitFor();
      await p.waitForTimeout(3200);
      assert.equal(await p.evaluate(() => __tv.s.epoch), clearEpoch);
      assert.equal(await p.locator(".screen-tv-safe").count(), 0);
      await click("cancel-clear");
      await click("toggle-pause");
      if (process.env.TV_OUTCOME === "giveup") await click("give-up");
      else if (process.env.TV_OUTCOME === "timeout") await p.evaluate(() => {
        window.__originalDateNow = Date.now;
        Date.now = () => window.__originalDateNow() + 180000;
      });
      else { await click("judge"); await click("correct"); }
      await p.waitForFunction(() => __tv.frames.at(-1)?.phase === "result");
      if (process.env.TV_OUTCOME === "timeout") await p.evaluate(() => { Date.now = window.__originalDateNow; });
      assert.match(
        await p.locator(".result-answer").textContent(),
        /PRIVATE_WORD_/,
      );
      assert.match(await p.evaluate(() => __tv.frames.at(-1).completedAnswer), /PRIVATE_WORD_/);
      await click("next-round");
      await p.waitForFunction(
        () =>
          __tv.frames.at(-1)?.phase === "waiting" &&
          __tv.frames.at(-1).strokes.length === 0,
      );
      await click("exit");
      await click("words");
      await p.waitForFunction(() => __tv.frames.at(-1)?.phase === "waiting");
      assert.match(await p.locator("body").textContent(), /PRIVATE_WORD_/);
      await p.evaluate(() => __tv.background(true));
      await p.locator(".screen-tv-safe").waitFor();
      assert.doesNotMatch(
        await p.locator("body").textContent(),
        /PRIVATE_WORD_|PRIVATE_NAME_/,
      );
      await p.evaluate(() => __tv.background(false));
      await p.locator('[data-action="tv-continue"]').waitFor();
      await click("tv-continue");
      assert.match(await p.locator("body").textContent(), /PRIVATE_WORD_/);
      await click("home");
      await click("gallery");
      await p.waitForFunction(() => __tv.frames.at(-1)?.phase === "waiting");
      await click("gallery-back");
      await click("tv");
      // A bridge failure during cancellation must not auto-dismiss the recovery gate.
      await p.evaluate(() => {
        __tv.rejectAck = 1;
      });
      await click("tv-disable");
      await p.waitForFunction(() => __tv.rejectAck === 0);
      await p.locator(".screen-tv-safe").waitFor();
      await click("tv-refresh");
      await p.locator('[data-action="tv-continue"]').waitFor();
      await click("tv-continue");
      await click("tv-back");
      await p.locator('[data-action="quick"]').waitFor();
      await p.evaluate(() => __tv.capture(true));
      await p.locator(".screen-tv-safe").waitFor();
      assert.equal(await p.locator('[data-action="tv-continue"]').count(), 0);
      await p.evaluate(() => __tv.capture(false));
      await p.locator('[data-action="tv-continue"]').waitFor();
      assert.match(
        await p.locator("h1").textContent(),
        /private screen is ready/,
      );
      await click("tv-continue");
      const exported = await p.evaluate(() => ({
        frames: __tv.frames,
        acks: __tv.acks,
      }));
      assert.doesNotMatch(
        JSON.stringify(exported.frames.map(({completedAnswer, ...rest}) => rest)),
        /PRIVATE_WORD_|PRIVATE_NAME_|custom[0-9]/,
      );
      assert.ok(exported.acks.every((x) => x.neutral && !x.privateText));
      for (const frame of exported.frames) {
        if (frame.phase !== "result") assert.equal(frame.completedAnswer, "");
        assert.doesNotMatch(frame.completedAnswer, /PRIVATE_NAME_|custom[0-9]/);
        assert.deepEqual(
          Object.keys(frame).sort(),
          [
            "v",
            "epoch",
            "seq",
            "round",
            "phase",
            "ratio",
            "seconds",
            "mode",
            "scores",
            "strokes",
            "language",
            "completedAnswer",
          ].sort(),
        );
      }
      records.push({
        engine,
        case: "private/public lifecycle",
        frames: exported.frames.length,
        liveStrokePoints: live.sent,
        undoRedoReflected: true,
        neutralAcks: exported.acks.length,
        onlyCompletedAnswerPublicInResult: true,
        reconnectRequiresContinue: true,
        staleEpochRejected: true,
        sameEpochAckRetry: true,
        galleryAndWordsStayPrivate: true,
        backgroundAndDisabledCaptureProtected: true,
        coldBackgroundAndReconnectingEnterHomeAutomatically: true,
        optionalGuideWithFourSteps: true,
        cancelWaitingReturnsHomeAfterNeutralAck: true,
      });
      await c.close();
      for (const lang of (process.env.TEST_LANGUAGES || "en,zh").split(","))
        for (const [width, height] of [
          [320, 568],
          [390, 844],
          [667, 375],
          [844, 390],
        ])
          for (const scale of [1, 2, 3.12]) {
            const c = await b.newContext({
                viewport: { width, height },
                serviceWorkers: "block",
              }),
              p = await c.newPage();
            await p.addInitScript(
              (profile) =>
                (localStorage.sg_v1_profile = JSON.stringify(profile)),
              { ...profile, language: lang },
            );
            await p.goto(process.env.TEST_URL);
            await p.locator('[data-action="tv"]').first().click();
            await p.evaluate((scale) => {
              document.documentElement.style.setProperty(
                "--text-scale",
                String(scale),
              );
              document.documentElement.classList.toggle(
                "large-text",
                scale > 1.35,
              );
            }, scale);
            await p.evaluate(() => document.fonts.ready);
            assert.equal(
              await p.locator('[data-action="tv-enable"]').count(),
              0,
            );
            const layout = await p.evaluate(() => ({
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              small: [...document.querySelectorAll("button")].some((b) => {
                const r = b.getBoundingClientRect();
                return r.width < 44 || r.height < 44;
              }),
            }));
            assert.deepEqual(
              layout,
              { overflow: false, small: false },
              JSON.stringify({ engine, lang, width, height, scale }),
            );
            records.push({
              engine,
              case: "TV info layout",
              lang,
              width,
              height,
              scale,
              ...layout,
            });
            await c.close();
          }
    } finally {
      await b.close();
    }
  }
  fs.writeFileSync(
    process.env.RECEIPT || "../v1-checks/tv-mode/browser.json",
    JSON.stringify({ records }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ cases: records.length, failures: 0 }));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
