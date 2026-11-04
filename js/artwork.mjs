import { drawStroke } from "./canvas.mjs";

// Render only the player's strokes. No DOM, player names, word cards or GUI assets.
export function artworkPNG(strokes, ratio = 1) {
  if (!Array.isArray(strokes) || !strokes.length)
    throw new Error("emptyArtwork");
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = ratio === 1 ? 1600 : 1200;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes)
    drawStroke(ctx, stroke, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export async function exportArtwork(action, png) {
  const native = globalThis.webkit?.messageHandlers?.partyArtwork;
  if (native) return native.postMessage({ action, png });
  const bytes = Uint8Array.from(atob(png.split(",")[1]), (c) =>
    c.charCodeAt(0),
  );
  const file = new File([bytes], "Sketch-and-Guess-drawing.png", {
    type: "image/png",
  });
  if (action === "share" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return { status: "shared" };
    } catch (error) {
      if (error.name === "AbortError") return { status: "cancelled" };
      throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { status: "downloaded" };
}
