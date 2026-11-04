import test from "node:test";
import assert from "node:assert/strict";
import { publicTVFrame, validTVFrame, createTVTransport } from "../js/tv.mjs";
const SECRET = "PRIVATE_ANSWER_DO_NOT_BROADCAST";
const game = {
  id: SECRET,
  word: { en: SECRET, zh: SECRET, id: SECRET },
  deck: [SECRET],
  settings: { surface: "canvas", mode: "individual" },
  phase: "drawing",
  canvasRatio: 1,
  players: [
    { name: SECRET, id: SECRET, score: 2 },
    { name: SECRET, score: 1 },
  ],
  strokes: [
    {
      color: "#123456",
      width: 7,
      points: [
        [0.1, 0.2],
        [0.8, 0.9],
      ],
      answer: SECRET,
    },
  ],
  history: [{ word: SECRET }],
  turn: 0,
};
const frame = (extra = {}) =>
  publicTVFrame({
    game,
    visible: true,
    epoch: 1,
    seq: 1,
    round: 1,
    remainingMs: 59001,
    language: "en",
    ...extra,
  });
test("TV projector copies only public geometry and numeric scores, never secret/name/game IDs", () => {
  const f = frame();
  assert.ok(validTVFrame(f));
  assert.equal(JSON.stringify(f).includes(SECRET), false);
  assert.deepEqual(f.scores, [2, 1]);
  assert.equal(f.seconds, 60);
  assert.equal(f.strokes[0].answer, undefined);
  f.strokes[0].points[0][0] = 0.9;
  assert.equal(game.strokes[0].points[0][0], 0.1);
  for (const phase of ["handoff", "reveal", "drawing", "result", "final"]) {
    const value = frame({ game: { ...game, phase } });
    assert.equal(JSON.stringify(value).includes(SECRET), false);
    if (["handoff", "reveal"].includes(phase))
      assert.equal(value.strokes.length, 0);
  }
});
test("private screens/paper/oversized or invalid ink produce a clean waiting frame", () => {
  for (const options of [
    { visible: false },
    { game: { ...game, settings: { ...game.settings, surface: "paper" } } },
    { strokes: [{ color: SECRET, width: 7, points: [[0, 1]] }] },
    { strokes: Array.from({ length: 401 }, () => game.strokes[0]) },
    {
      strokes: [
        {
          color: "#123456",
          width: 7,
          points: Array.from({ length: 2001 }, () => [0, 1]),
        },
      ],
    },
  ]) {
    const f = frame(options);
    assert.ok(validTVFrame(f));
    assert.equal(f.phase, "waiting");
    assert.deepEqual(f.strokes, []);
    assert.equal(f.seconds, 0);
    assert.equal(JSON.stringify(f).includes(SECRET), false);
  }
});
test("TV allowlist rejects unknown/nested keys, numeric booleans, malformed coordinates and unbounded values", () => {
  const good = frame();
  const variants = [
    { ...good, word: SECRET },
    { ...good, seconds: true },
    { ...good, seq: 1.1 },
    { ...good, scores: [Infinity] },
    { ...good, phase: SECRET },
    { ...good, language: SECRET },
    { ...good, strokes: [{ ...good.strokes[0], word: SECRET }] },
    { ...good, strokes: [{ ...good.strokes[0], points: [[0, NaN]] }] },
    { ...good, strokes: [{ ...good.strokes[0], points: [[0, 1, 0]] }] },
    { ...good, strokes: [{ ...good.strokes[0], width: 0 }] },
    { ...good, strokes: [{ ...good.strokes[0], points: [[true, 1]] }] },
  ];
  for (const f of variants) assert.equal(validTVFrame(f), false);
});
const status = (extra = {}) => ({
  available: true,
  enabled: true,
  connected: true,
  privateAllowed: true,
  resetRequired: false,
  epoch: 1,
  reason: "connected",
  ...extra,
});
test("bridge epochs reject late statuses and single-flight public writes carry increasing sequence", async () => {
  const target = new EventTarget(),
    events = [],
    sent = [];
  let finish;
  const bridge = {
    postMessage(m) {
      sent.push(m);
      if (m.action === "frame") return new Promise((r) => (finish = r));
      return status();
    },
  };
  const tv = createTVTransport({
    bridge,
    target,
    onStatus: (s) => events.push(s),
  });
  await tv.start();
  const pending = tv.publish(({ epoch, seq }) => frame({ epoch, seq }));
  await Promise.resolve();
  await tv.publish(({ epoch, seq }) => frame({ epoch, seq }));
  assert.equal(sent.filter((m) => m.action === "frame").length, 1);
  target.dispatchEvent(
    new CustomEvent("party-tv-status", {
      detail: status({
        epoch: 2,
        privateAllowed: false,
        resetRequired: true,
        reason: "reconnecting",
      }),
    }),
  );
  finish(status());
  await pending;
  assert.equal(tv.status.epoch, 2);
  assert.equal(tv.status.privateAllowed, false);
  target.dispatchEvent(
    new CustomEvent("party-tv-status", { detail: status({ epoch: 2 }) }),
  );
  const p2 = tv.publish(({ epoch, seq }) => frame({ epoch, seq }));
  await Promise.resolve();
  assert.equal(sent.at(-1).frame.seq, 1);
  finish(status({ epoch: 2 }));
  await p2;
  tv.stop();
});
test("unknown status, rejected bridge, and timed-out native replies keep private UI blocked", async () => {
  for (const reply of [
    () => Promise.resolve({}),
    () => Promise.reject(Error("disconnected")),
    () => new Promise(() => {}),
  ]) {
    const tv = createTVTransport({
      bridge: { postMessage: reply },
      target: new EventTarget(),
      timeoutMs: 10,
    });
    await tv.start();
    assert.equal(tv.status.privateAllowed, false);
    assert.equal(tv.status.reason, "reconnecting");
    tv.stop();
  }
});

test("completed answer is public only on the visible result, and clears on every private phase", () => {
  for (const phase of ["handoff", "reveal", "drawing", "result", "final"]) {
    const f = frame({game:{...game,phase},completedAnswer:"Taxi · 的士"});
    assert.equal(f.completedAnswer, phase === "result" ? "Taxi · 的士" : "");
    assert.ok(validTVFrame(f));
    assert.equal(frame({game:{...game,phase},visible:false,completedAnswer:SECRET}).completedAnswer, "");
  }
  const result = frame({game:{...game,phase:"result"},completedAnswer:"Taxi"});
  for (const phase of ["waiting","drawing"]) assert.equal(validTVFrame({...result,phase}),false);
  assert.equal(validTVFrame({...result,completedAnswer:"x".repeat(513)}),false);
  assert.equal(frame({game:{...game,phase:"result"},completedAnswer:SECRET,strokes:Array(401).fill(game.strokes[0])}).completedAnswer, "");
});
test("busy bridge delivers latest waiting frame after result instead of replaying older queued content", async () => {
  const sent = []; let finish;
  const tv = createTVTransport({target:new EventTarget(),bridge:{postMessage:async message => {
    if (message.action !== "frame") return status();
    sent.push(message.frame);
    return new Promise(resolve => { finish = () => resolve(status()); });
  }}});
  await tv.start();
  const first = tv.publish(({epoch,seq}) => frame({epoch,seq,game:{...game,phase:"result"},completedAnswer:"Taxi"}));
  await Promise.resolve();
  await tv.publish(({epoch,seq}) => frame({epoch,seq,game:{...game,phase:"result"},completedAnswer:"Taxi"}));
  await tv.publish(({epoch,seq}) => frame({epoch,seq,game:{...game,phase:"handoff"},completedAnswer:SECRET}));
  finish(); await first;
  assert.equal(sent.length,2);
  assert.equal(sent[1].phase,"waiting");
  assert.equal(sent[1].completedAnswer,"");
  assert.ok(sent[1].seq>sent[0].seq);
  finish(); tv.stop();
});
