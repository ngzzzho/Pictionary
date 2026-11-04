export function drawStroke(target, stroke, width, height) {
  target.strokeStyle = stroke.color;
  target.fillStyle = stroke.color;
  target.lineCap = "round";
  target.lineJoin = "round";
  target.lineWidth = (stroke.width * width) / 800;
  const pts = stroke.points;
  const x = (p) => p[0] * width,
    y = (p) => p[1] * height;
  target.beginPath();
  if (pts.length === 1) {
    target.arc(x(pts[0]), y(pts[0]), target.lineWidth / 2, 0, Math.PI * 2);
    target.fill();
    return;
  }
  // Quadratic segments through midpoints smooth fast finger/stylus input without changing stored points.
  target.moveTo(x(pts[0]), y(pts[0]));
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (x(pts[i]) + x(pts[i + 1])) / 2,
      my = (y(pts[i]) + y(pts[i + 1])) / 2;
    target.quadraticCurveTo(x(pts[i]), y(pts[i]), mx, my);
  }
  const last = pts[pts.length - 1];
  target.lineTo(x(last), y(last));
  target.stroke();
}

export function mountCanvas(canvas, g, brush, save, limit) {
  const ctx = canvas.getContext("2d");
  // Committed strokes are cached on an offscreen layer; live input only redraws the active stroke.
  const layer = document.createElement("canvas");
  const layerCtx = layer.getContext("2d");
  let current = null,
    pointer = null,
    frame = null,
    pointBudget = 2000,
    warned = false,
    cached = { strokes: null, length: -1, width: 0, height: 0 };
  function refreshLayer() {
    const same =
      cached.strokes === g.strokes &&
      cached.length === g.strokes.length &&
      cached.width === canvas.width &&
      cached.height === canvas.height;
    if (same) return;
    layer.width = canvas.width;
    layer.height = canvas.height;
    layerCtx.fillStyle = "#ffffff";
    layerCtx.fillRect(0, 0, layer.width, layer.height);
    for (const stroke of g.strokes)
      drawStroke(layerCtx, stroke, layer.width, layer.height);
    cached = {
      strokes: g.strokes,
      length: g.strokes.length,
      width: canvas.width,
      height: canvas.height,
    };
  }
  function paint() {
    const host = canvas.parentElement.getBoundingClientRect();
    const ratio = g.canvasRatio === 1 ? 1 : 4 / 3;
    const width = Math.min(host.width, host.height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${width / ratio}px`;
    const rect = canvas.getBoundingClientRect(),
      scale = Math.min(devicePixelRatio || 1, 3);
    const widthPx = Math.round(rect.width * scale),
      heightPx = Math.round(rect.height * scale);
    if (canvas.width !== widthPx) canvas.width = widthPx;
    if (canvas.height !== heightPx) canvas.height = heightPx;
    if (!canvas.width || !canvas.height) return;
    refreshLayer();
    ctx.drawImage(layer, 0, 0);
    if (current) drawStroke(ctx, current, canvas.width, canvas.height);
  }
  function requestPaint() {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      paint();
    });
  }
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ].map((n) => Math.round(n * 10000) / 10000);
  };
  function flush() {
    if (!current) return;
    g.strokes.push(current);
    g.redo = [];
    g.clearUndo = null;
    current = null;
    pointer = null;
    save();
    paint();
  }
  function appendPoint(e) {
    const next = point(e),
      last = current.points.at(-1);
    if (next[0] === last[0] && next[1] === last[1]) return;
    if (current.points.length >= pointBudget) {
      if (!warned) limit();
      warned = true;
      return;
    }
    current.points.push(next);
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (!g.timer.running || g.phase !== "drawing" || pointer !== null) return;
    if (e.button !== 0) return;
    if (
      g.strokes.length >= 400 ||
      g.strokes.reduce((n, s) => n + s.points.length, 0) >= 12000
    ) {
      limit();
      return;
    }
    e.preventDefault();
    pointBudget = Math.min(
      2000,
      12000 - g.strokes.reduce((n, s) => n + s.points.length, 0),
    );
    warned = false;
    pointer = e.pointerId;
    // Capture can fail when iOS interrupts a gesture; never strand the active pointer.
    try { canvas.setPointerCapture(pointer); } catch { pointer = null; return; }
    current = {
      color: brush.eraser ? "#ffffff" : brush.color,
      width: brush.eraser ? 24 : brush.width,
      points: [point(e)],
    };
    paint();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointer || !current) return;
    e.preventDefault();
    const samples = e.getCoalescedEvents?.() || [];
    for (const sample of samples.length ? samples : [e]) {
      appendPoint(sample);
    }
    requestPaint();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(event, (e) => {
      if (e.pointerId !== pointer) return;
      // A fast flick can have no pointermove. Keep the release endpoint, but
      // never append cancellation coordinates from an OS gesture/interruption.
      if (event === "pointerup" && current) appendPoint(e);
      flush();
    });
  // iOS image/text callouts can consume the release event. Block them only on
  // the drawing surface; inputs and accessibility zoom elsewhere remain usable.
  const blockCallout = e => { e.preventDefault(); flush(); };
  const blockTouch = e => { if (e.cancelable) e.preventDefault(); };
  const endTouches = e => { if (!e.touches.length) flush(); };
  const endPointer = e => { if (e.pointerId === pointer) flush(); };
  canvas.addEventListener("contextmenu", blockCallout);
  canvas.addEventListener("selectstart", blockCallout);
  canvas.addEventListener("touchstart", blockTouch, { passive: false });
  window.addEventListener("touchend", endTouches);
  window.addEventListener("touchcancel", endTouches);
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);
  window.addEventListener("blur", flush);
  const initialHost = canvas.parentElement.getBoundingClientRect();
  let hostSize = `${initialHost.width}:${initialHost.height}`;
  const observer = new ResizeObserver(() => {
    const rect = canvas.parentElement.getBoundingClientRect();
    const nextSize = `${rect.width}:${rect.height}`;
    // Close the accepted stroke before rotation changes its coordinate space.
    if (hostSize && hostSize !== nextSize) flush();
    hostSize = nextSize;
    paint();
  });
  observer.observe(canvas.parentElement);
  paint();
  return {
    flush,
    paint,
    // Read-only source for the public TV projector, including the live stroke.
    // The projector makes its own bounded copy; this does not commit the stroke.
    previewStrokes: () => current ? [...g.strokes, current] : g.strokes,
    destroy() {
      flush();
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      observer.disconnect();
      canvas.removeEventListener("contextmenu", blockCallout);
      canvas.removeEventListener("selectstart", blockCallout);
      canvas.removeEventListener("touchstart", blockTouch);
      window.removeEventListener("touchend", endTouches);
      window.removeEventListener("touchcancel", endTouches);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
      window.removeEventListener("blur", flush);
    },
  };
}
