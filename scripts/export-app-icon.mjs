// Standard platform-size exports of the image_gen-designed original icon.
// Keep the full-size master and previous fixed candidates unchanged.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const source = "assets/brand/sketch-cat-app-icon-master-v1.png";
if (!fs.existsSync(source)) throw new Error(`Missing original icon: ${source}`);
for (const [size, destination] of [
  [1024, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"],
  [512, "icons/icon-512.png"],
  [192, "icons/icon-192.png"],
  [180, "icons/apple-touch-icon.png"],
]) {
  execFileSync(
    "sips",
    [
      "--resampleHeightWidth",
      String(size),
      String(size),
      source,
      "--out",
      destination,
    ],
    { stdio: "pipe" },
  );
}
console.log(
  "Exported opaque iOS and local-preview icons; original master preserved.",
);
