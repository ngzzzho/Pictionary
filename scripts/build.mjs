import { validateLocales } from "./validate-locales.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
// dist contains only distributable assets, never tests, docs or source word archive.
// Licensed components must be imported locally; do not silently ship a broken skin.
const catalogs = await validateLocales();
const manifestText = await fs.readFile("scripts/layerlab-assets.json", "utf8");
const licensed = JSON.parse(manifestText);
const characterManifestText = await fs.readFile(
  "scripts/character-assets.json",
  "utf8",
);
const characters = JSON.parse(characterManifestText);
const sceneManifestText = await fs.readFile(
  "scripts/scene-assets.json",
  "utf8",
);
const scenes = JSON.parse(sceneManifestText);
const fontManifestText = await fs.readFile("scripts/font-assets.json", "utf8");
const fonts = JSON.parse(fontManifestText);
const sourceFonts = JSON.parse(await fs.readFile("scripts/font-source-assets.json", "utf8"));
const repair =
  "Run python3 scripts/import-layerlab.py with your purchased local archive; do not publish the archive.";
let slices;
try {
  slices = await fs.readFile("css/layerlab-slices.css", "utf8");
} catch {
  throw new Error(`Missing generated LayerLab slices. ${repair}`);
}
const sha = (data) => createHash("sha256").update(data).digest("hex");
if (!slices.includes(`manifest-sha256: ${sha(manifestText)}`))
  throw new Error(`LayerLab manifest/slices mismatch. ${repair}`);
for (const asset of licensed) {
  let data;
  try {
    data = await fs.readFile(asset.file);
  } catch {
    throw new Error(
      `Missing licensed LayerLab asset: ${asset.file}. ${repair}`,
    );
  }
  if (data.length !== asset.bytes || sha(data) !== asset.sha256)
    throw new Error(
      `LayerLab asset integrity mismatch: ${asset.file}. ${repair}`,
    );
}
// Original generated character art is separate from licensed GUI pixels.
// Validate before updating dist so a missing pose cannot produce a partial build.
for (const asset of [...characters, ...scenes, ...fonts, ...sourceFonts]) {
  const data = await fs.readFile(asset.file);
  if (data.length !== asset.bytes || sha(data) !== asset.sha256)
    throw new Error(`Bundled asset integrity mismatch: ${asset.file}`);
}
await fs.mkdir("dist/assets/layerlab", { recursive: true });
for (const asset of licensed)
  await fs.copyFile(asset.file, path.join("dist", asset.file));
await fs.mkdir("dist/assets/characters", { recursive: true });
for (const asset of characters)
  await fs.copyFile(asset.file, path.join("dist", asset.file));
await fs.mkdir("dist/assets/fonts", { recursive: true });
// Only remove superseded generated copies; full source fonts remain in assets/.
for (const asset of sourceFonts) {
  if (!/^assets\/fonts\/[a-z0-9-]+\.woff2$/.test(asset.file)) throw new Error("Invalid source font path");
  await fs.rm(path.join("dist",asset.file), {force:true});
}
for (const asset of fonts)
  await fs.copyFile(asset.file, path.join("dist", asset.file));
await fs.mkdir("dist/assets/scenes", { recursive: true });
for (const asset of scenes)
  await fs.copyFile(asset.file, path.join("dist", asset.file));
await fs.mkdir("dist", { recursive: true });
for (const name of ["index.html", "manifest.webmanifest", "sw.js"])
  await fs.copyFile(name, path.join("dist", name));
for (const dir of ["css", "icons"])
  await fs.cp(dir, path.join("dist", dir), { recursive: true });
await fs.mkdir("dist/js", { recursive: true });
await fs.copyFile("js/content.json", "dist/js/content.json");
// Native TV uses only fixed interface labels. Word dictionaries never enter its renderer.
await fs.writeFile(
  "dist/js/native-locales.json",
  JSON.stringify(
    Object.fromEntries(
      Object.entries(catalogs).map(([code, data]) => [code, { ...data.native, cancel: data.backup.cancel }]),
    ),
  ),
);
for (const [code, data] of Object.entries(catalogs)) {
  const appleCode =
    code === "zh-TW"
      ? "zh-Hant-TW"
      : code === "zh"
        ? "zh-Hant"
        : code === "pt"
          ? "pt"
          : code;
  const dir = `ios/App/App/${appleCode}.lproj`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    `${dir}/InfoPlist.strings`,
    `"NSPhotoLibraryAddUsageDescription" = ${JSON.stringify(data.native.photosUsage)};\n`,
  );
}
await build({
  entryPoints: ["js/app.js"],
  outfile: "dist/js/app.js",
  bundle: true,
  format: "esm",
  target: "safari15",
  minify: false,
});
// The native bundle never registers a worker; web distribution gets its own coherent asset list.
let sw = (await fs.readFile("sw.js", "utf8"))
  .replace(/'\.\/js\/[^']+\.mjs',/g, "")
  .replace(
    "'./js/core.mjs','./js/storage.mjs','./js/canvas.mjs','./js/i18n.mjs','./js/artwork.mjs','./js/artwork-store.mjs',",
    "",
  );
// The earlier source list contained only the first 12 skins. Include the whole
// approved manifest in the dist worker so an offline app never mixes skin sets.
const sourceAssets = [
  ...sw.match(/const ASSETS=\[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g),
].map((m) => m[1]);
// Every shipped stylesheet participates in both atomic offline installation and
// the cache fingerprint, including new screen-specific styles.
const stylesheets = (await fs.readdir("dist/css"))
  .filter((name) => name.endsWith(".css"))
  .sort()
  .map((name) => `css/${name}`);
const releaseAssets = [
  ...new Set([
    ...sourceAssets.filter(
      (f) =>
        !f.startsWith("./js/locales/") && f !== "./js/legacy-word-labels.json",
    ),
    "./js/native-locales.json",
    ...stylesheets.map((file) => "./" + file),
    ...licensed.map((a) => "./" + a.file),
    ...characters.map((a) => "./" + a.file),
    ...scenes.map((a) => "./" + a.file),
    ...fonts.map((a) => "./" + a.file),
  ]),
];
sw = sw.replace(
  /const ASSETS=\[[\s\S]*?\];/,
  `const ASSETS=${JSON.stringify(releaseAssets)};`,
);
const releaseHash = sha(
  Buffer.concat(
    await Promise.all(
      [
        "dist/index.html",
        "dist/js/app.js",
        "dist/js/content.json",
        ...stylesheets.map((file) => "dist/" + file),
        "dist/js/native-locales.json",
        "scripts/layerlab-assets.json",
        "scripts/character-assets.json",
        "scripts/scene-assets.json",
        "scripts/font-assets.json",
        "dist/icons/icon-192.png",
        "dist/icons/icon-512.png",
        "dist/icons/apple-touch-icon.png",
      ].map((f) => fs.readFile(f)),
    ),
  ),
).slice(0, 12);
sw = sw.replace(
  "family-v1-9-layerlab-a",
  "family-v1-9-layerlab-a-" + releaseHash,
);
await fs.writeFile("dist/sw.js", sw);
console.log("Built dist/");
