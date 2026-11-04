# iOS source review checkpoint — 2026-11-04

This branch is a local iOS review candidate, not a release or deployment. The sections below include historical checkpoints; current source and this section take precedence.

## Cross-check priorities

- Team setup chooses `own` or `open` guessing (`js/team-guessing.mjs`). Missing optional values preserve the previous local open rule. The guesser’s team gets one point; verify undo, zero-time corrections and old-save compatibility.
- 1/2/3/5/10 rounds, free50 capacity and replacement reservation; score-image export for finished games, original branded drawing exports, and native accepted PNG sizes.
- Native asynchronous text entry, long-press drawing, nonblocking clear confirmation, TV heartbeat/capture/route protections, public completed-round answers and next-turn privacy.
- StoreKit verified entitlement refresh, purchase/restore/offline/revocation. Identity remains `com.local.familydraw` / `com.local.familydraw.fullversion`; local StoreKit fixtures are not App Store Connect configuration.
- Preserve all player data, custom words, artworks and ongoing game snapshots. Review does not authorize store changes, publishing or deployment. Do not push to `claude/**`, `main` or `master`: those branch names trigger the Pages workflow.

## Validation and reproduction

Run `npm ci --ignore-scripts` then `npm test` (103 tests passing at this checkpoint). Browser tests under `tests/` use isolated synthetic profiles and configurable `TEST_URL`, `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE`; some require a synthetic verified-purchase bridge. Never use real customer data as fixtures.

Local Debug simulator and unsigned Release iPhone builds passed; 153 bundled public files match the local distribution. These are engineering checks, not physical-device, App Store, AirPlay or native-speaker acceptance. Actual device Photos/share and new setup-mode acceptance remain manual.

Purchased Layer Store assets (`assets/layerlab/`) and generated `css/layerlab-slices.css` are intentionally excluded from Git. Build validates locally imported licensed assets and will fail on a fresh clone until the authorized local importer/source is available. Do not bypass integrity checks or feed licensed pixels into a generative model. `dist/`, native public output, dependencies, local audit reports and device data are also excluded. Source manifests and original brand art/fonts with license notices are included for review.

---

## Current local share/play update — 2026-10-14

Save/share now exports the untouched drawing region plus a 400px branded footer (1600×2000 square drawings;1600×1600 legacy4:3). Original App icon + Sketch & Guess are always present. Answer is opt-in and defaults off; preview is the exact PNG sent to Photos/share. Original strokes and archives are unchanged. The historical strokes-only export description below is superseded.

12-colour palette; optional validated `sg_brush_v1` remembers colour/width only, not eraser or purchase rights. Forward actions stay at the bottom above the safe area. Ordinary phone-only lifecycle no longer adds TV Continue; drawing has one explicit pause/resume. Actual TV/capture/unknown-route protections still require safe native acknowledgment and explicit recovery; recovery Continue resumes a non-expired drawing. This supersedes older blanket lifecycle-Continue descriptions below. Device acceptance remains pending; see workspace SHARE-PLAY-POLISH-2026-10-14.md.

## Current local checkpoint: deeper categories and object split — 2026-10-14

Local candidate **8799 / be46e0207b8e** has 779 active cards (296 Easy / 483 Standard), with 94 reviewed additions. Objects splits into Home & daily life (98) and Tools & play (93); Animals 91, Food 95, Jobs 88, Nature 93 and Travel 90 approach 100. Activities & sports remains 131 because splitting it yields 56/75. All eight subjects at both levels support 36 unique turns plus one swap each turn.

Old Objects preferences, including combinations, resolve to both new subjects; active saved decks remain exact. The previous 685 records only change the explicit 191 object memberships; all 456 held records and 11 × 1,091 historical labels remain unchanged. Future multi-select, old-game and backup contracts are covered by 59 Node tests, 53 focused browser cases and 57 multi-select cases. Both native products match the 148-file distribution; Xcode is synced. See workspace TOPIC-DEPTH-REVIEW-2026-10-14.md and its catalogue for detailed evidence, preserved failures and translation/playtest limits.

Select the connected iPhone in Xcode and Run (CmdR) to update in place. Do not uninstall or clear data. No physical-device install, signing change, push or deployment was performed. Stage 4 and human/device acceptance remain open.

---

## Current local checkpoint: playable topic pools and multi-select — 2026-10-14

Local candidate **8798 / 1f2b9d51d607** contains685active concepts (281Easy/404Standard), seven broader subjects and73reviewed mainstream additions. Word cards supports multiple built-in subjects with persistent, difficulty-filtered union selection. Food+Jobs has158cards:48Easy/110Standard. Tiles show eligible and all-level counts; small pools can be combined, while Start validates final scheduled capacity. Mixed/Starter/custom remain exclusive. Existing active saves are never regenerated.

54Node tests,57new browser flows,311compact regression cases and12actual native WKWebView observations pass; both iOS products build and148publicfiles match. All shipped CSS now enters offline precache and release fingerprint; native TV/data/scoring code is unchanged. Original612word text/difficulty,456held records,11×1018historical labels and candidate8797are preserved.73newconcepts have drawing cues and complete eleven-locale labels; native-speaker/family/device/Stage4acceptance remains open. See workspace TOPIC-POOLS-REVIEW-2026-10-14.md and TOPIC-POOLS-CATALOG-2026-10-14.csv for counts, failures and evidence limits.

Xcode is synced. Select the connected iPhone and Run (CmdR) to update in place; do not uninstall or clear data. Only the task-created QA simulator was installed/shut down. No user-device installation, signing change, push or deployment.

---

## Current local checkpoint: compact iPhone setup — 2026-10-14

Local candidate **8797 / 2e94b5a1bc84** gives setup separate header/progress/content/action rows. The footer no longer covers choices; English labels no longer break inside words and step numbers align. At393×852default type/four players, English and Traditional Chinese each fit the four setup steps without page scrolling. Category lists and card previews expand on request. Settings uses a compact current-language row. Same-view updates preserve scroll, drafts and focus; favourite toggles retain loaded gallery pages. Large text, short landscape and larger rosters retain necessary scrolling.

309isolated Chromium/WebKit checks and8actual native WKWebView setup cases pass;50Node plus documented localization/offline/artwork/restore regressions pass.148publicfiles match both native products. Current Xcode is synced; select the connected iPhone and Run to update the development app in place. Do not uninstall or clear its data. No user-device installation, signing changes, push or deploy performed. See workspace COMPACT-UI-REVIEW-2026-10-14.md for exact coverage, preserved failures and remaining physical keyboard/rotation/human acceptance. Core storage, cards, scoring, artwork and TV privacy code remain unchanged.

---

## Current local checkpoint: optional TV setup — 2026-10-14

Local candidate **8796 / daffaf9d0fa2** separates ordinary startup from optional TV play. Safe cold launch enters Home after the neutral handshake; actual capture/unknown routes remain covered. Home/Settings TV setup has a localized four-step Control Center guide and Screen Mirroring icon. Native waiting cover repeats the guide, supports Dynamic Type/scrolling, and offers Play on this device. Safe cancellation returns after acknowledgment; a new interruption retains Continue. Unchanged layout geometry no longer forces a recovery epoch; actual capture, screen and lifecycle changes still do.

This UIKit external-canvas implementation still connects through system Control Center Screen Mirroring or a compatible cable. No in-app audio/video route picker is presented as game mirroring. Questions, rules, storage, art and signing identity remain unchanged. See workspace TV-OPTIONAL-REVIEW-2026-10-14.md for final validation and hardware limits. No push/deploy or user-device install. In Xcode select your iPhone and Run to update the installed development app.

---

## Current local checkpoint: Easy and Standard only — 2026-10-14

Fixed local candidate **8795 / 45fee56a8deb**. The user removed Hard as a playable level. New games offer Easy, Standard (stored as `medium`) and an explicit mix of both. **612 active cards: 243 Easy + 369 Standard**, twelve subjects, Quick Play243. Twenty-one natural concepts from the former27Hard cards move to Standard, including the user's hot pot and eight jobs. Twelve composed or unnatural scene prompts are parked (six formerHard, six formerMedium). No new words or renamed answers.

`scripts/content-two-level-policy.json` records33decisions bound to the exact624-card prior input; the existing795-card review remains unchanged as history. Eleven UI catalogs use the new levels; all11×1018wordlabels,1068stableIDs,444previousholds and old8794 remain unchanged. Active saved games still resume their exact historical cards/settings. HistoricalHardpreferences resolve to Standard for future setup with a notice; historicalHardReplay opens setup without replacing last/active/profile data. No storage migration or scoring change.

48Node tests and74isolatedtwo-engineflows pass, including every valid mixed-topic schedule with one swap perturn,36-turnStandardstart,small-subjectcapacityguard andoldHardprofile/Resume/Replay protection. Both native products built;147publicfiles match saved localcandidate. No install/push/deploy/signing. Human/native-speaker/device/Stage4acceptance remains open. See workspace TWO-LEVEL-REVIEW-2026-10-14.md.

---

## Historical checkpoint: drawing and guessing review — 2026-10-14

All 795 previously selectable cards received an explicit editorial decision and a drawing recipe or hold reason. **624 remain; 171 are parked; 212 retained cards changed difficulty.** The current split is 243 Easy / 354 Medium / 27 Hard, across twelve subjects. Quick Play uses 243 Easy cards. No new content was added. Obscure vocabulary, invisible intent, indistinguishable subtypes and redundant compositions are held rather than labelled Hard. This is editorial calibration, not human playtest evidence.

`scripts/content-playability-review.json` covers the exact 795-entry input bound by SHA256. Run `node scripts/content.mjs` to regenerate, then `npm test` and `npm run build`. All 1,068 IDs and 1,018 shipped labels per locale are retained; all previously held entries remain held. Active old games stay exact. New Replay applies current built-in subject/difficulty while preserving custom text and the old result. Eleven locales have updated difficulty hints, with word translations unchanged.

45 Node tests and 66 two-engine flow checks pass, including a 36-turn Hard game's explicit insufficient-pool recovery and old-Easy/new-Medium Replay exclusion. Two native products built and saved only. See workspace PLAYABILITY-REVIEW-2026-10-14.md and the full 795-row PLAYABILITY-AUDIT-2026-10-14.csv. Human/native-speaker/device acceptance remains open; no push/deploy/install/signing.

---

## Historical checkpoint: mainstream prompts first — 2026-10-14

The user has paused Silly Party and Expert Challenge. New games now use **795 prompts in twelve ordinary subjects:359Easy,255Medium,181Hard**. Quick Play uses325Easy-start cards. The218parked prompts (213silly/expert plus5ambiguous scenes) cannot enter Mixed, subjects or Replay. No target-count padding. This supersedes the older1,013active/three-playlist plan below.

All1,068IDs and all1,018shipped labels per locale are retained. Active saved games still resume exact old words/settings; old preferences resolve to current choices only for future play. Replaying a paused deck opens selection; other replays filter held cards while preserving custom text and historical results. Core/scoring/storage/IDB/canvas/native privacy code is unchanged. `scripts/content-mainstream-policy.json` makes parking explicit and reversible; `scripts/content.mjs` validates and regenerates, and locale validation retains archived labels.

43Node tests and62two-engine flows pass, including eleven-language phone layouts, old-save resume, future settings and Replay protection. Native products are built and saved only. Human guessability/native-speaker/device acceptance remains open. See workspace MAINSTREAM-REVIEW-2026-10-14.md and MAINSTREAM-CATALOG-2026-10-14.csv. No push/deploy/install/signing.

---

## Historical checkpoint: global content V2 — 2026-10-14

1,013 active prompts in twelve subject categories, without a geographic Hong Kong category. Four editorial levels:360Easy,354Medium,254Hard,45Expert; All levels remains explicit. Separate overlapping playlists:326Easy start,200Silly party,45Expert challenge. Quick Play uses Easy start. Every active concept has eleven locale labels (ten language families);1018shipped translation IDs include five retired concepts for old saves. Thirty old concepts have corrected/disambiguated labels;420new concepts have intended-picture notes. Model-authored translations/difficulty still require native-speaker and family acceptance.

New games use a unique pool: enough cards for every planned turn, swaps consume only spare cards. Setup explains capacity and prevents unavailable subjects from being selected; an invalidated selection has explicit wider-pool/fewer-turn recovery. Old saved games retain cycling and exact saved words. Topic aliases affect future selection only; no storage keys,IDB,score rules,artwork or custom text are rewritten. The optional drawPolicy field and expanded difficulty values remain within version1; use the new build for new backups because older binaries do not enforce the unique policy or understand new levels.

Source build: `node scripts/content.mjs` validates immutable v1 baseline, complete legacy review,420additions and all11catalogs before writing generated content. `npm test` covers unique scheduling, corruption, exact old-label identities and backup compatibility. Reports and the full reviewable CSV stay outside app/. See workspace CONTENT-V2-REVIEW-2026-10-14.md and CONTENT-V2-SPEC-2026-10-14.md. Existing artwork/fonts/LayerLab/native privacy source remain unchanged. Local only; no push/deploy/install/signing.

---

## Current local checkpoint: multilingual paid-iOS candidate

Ten language families are available offline: English, Chinese (Traditional and Simplified), Japanese, Korean, German, French, Spanish, Portuguese (Brazil), Italian and Arabic. This means eleven selectable language variants. Home → globe or Settings chooses one interface language; Game setup and Settings choose an ordered primary and optional second word-card language, with a preview. Explicitly selecting an interface language also makes it the primary card language and preserves a distinct second language (a duplicate is removed). Players may then override either card choice independently; this manual choice survives reload. Quick Play uses the saved preference. A running game retains its original card choice.

All currently active concepts and historical shipped labels, subjects, interface, gallery, backup/recovery and TV messages have complete validated catalogs. Original custom words and historical artwork titles remain unchanged. New Noto Arabic/JP/KR fonts and their licenses are bundled; Arabic is RTL while canvas coordinates stay unchanged. Native photo permission resources and static TV privacy strings are localized. Translations require native-speaker playtesting before a paid release.

Existing profile/game version1 and storage keys remain. Legacy `en`, `zh` and `both` remain valid; new locale codes and two distinct codes joined with `+` extend the same card-language string. Older binaries cannot restore these new settings. Storage/IDB/scoring were not migrated; the current content redesign is described above. See workspace MULTILINGUAL-SPEC-2026-10-13.md and MULTILINGUAL-REVIEW-2026-10-13.md for engineering evidence and remaining device/human gates. No push or deployment.

---

## Current local checkpoint: native TV play

Home → TV or Settings → TV play enables a dedicated native external-display canvas. Enable on the phone/iPad first, then connect AirPlay in Control Center or a compatible display cable. The external scene receives only bounded vector strokes (including live ink), countdown and numeric score slots; fixed Player/Team labels keep names private. Handoff, reveal, private pages and paper mode show a waiting screen. Browser preview explains the feature but cannot provide private casting.

Capture, unknown routing, backgrounding and reconnects cover the private screen and pause play. A fresh neutral-screen acknowledgement and explicit Continue are required before returning; old epochs and stale frames are rejected, and missed heartbeats blank the public display. Cold launch with an already connected display is deliberately blocked until it is disconnected, so a trusted local-screen anchor can be established. TV preference is session-only and adds no save-schema or scoring changes.

Local projection/bridge/state tests and native builds are engineering evidence, not AirPlay acceptance. Physical AirPlay/cable, lock/reconnect/peek, capture, native modal and iPad Stage Manager tests remain mandatory. UIKit reports capture/screen changes after they occur; no absolute zero-frame-leak claim is made, and system-owned UI is outside the app's cover. See workspace TV-MODE-SPEC.md and TV-MODE-REVIEW-2026-10-13.md. No push or deployment.

---

## Current local checkpoint: gallery and restore

Home → My Drawings keeps drawings across games, loads 12 thumbnails per page and supports favourites, full PNG save/share. Settings → Backup & restore prepares verified multipart JSON backups (save every part), previews a selected complete set, preserves current data by default, and can explicitly use the backup setup/game. Restore keeps pre-import recovery copies and recovers its journal before normal writes after interruption. Current/legacy storage keys and scoring remain unchanged; IDB adds catalogue/recovery stores at version2. Files support 256 MB raw / 10,000 drawings; malformed inputs do not overwrite data. Older raw+inMemory exports are accepted when their current-format values validate; legacy raw strings are retained, not blindly replayed. Native Photos/Files/share and human/device acceptance remain pending. No push/deploy/install.

New tests: backup-format/remap/checksum Node tests; gallery-restore-browser, restore-integrity-browser, gallery-restore-layout, gallery-offline-browser and three-games-gallery-browser scripts use isolated synthetic data. Reports and local evidence remain outside app/.

# Sketch & Guess / 畫猜派對 — local V1 candidate

Working descriptive title, not a cleared commercial name. This branch upgrades the original Pictionary Party host into an offline family drawing game. No App Store release, price configuration, push or deployment has been performed.

## Play

- Two-player cooperation; 3–12 individual players; 4–12 players in two balanced teams.
- Individual scoring: drawer +1, guesser +1. Team scoring: active team +1, no stealing. Co-op: one shared solved count.
- On-screen drawing or your own paper/whiteboard; secret reveal, one swap before starting when spare cards remain, 30/60/90/120-second turns.
- Canvas colours, brush sizes, eraser, stroke undo/redo and recoverable clear.
- Ten language families (eleven choices with both Chinese scripts); one interface language and independently selected one/two card languages, with all 612 currently active concepts translated.
- Custom local words, Easy and Standard plus All levels, saved game and latest completed recap.
- Backgrounding pauses and covers the game. Resume is manual. Sudden termination can lose up to roughly one second since the last completed snapshot, or the in-progress stroke; storage errors are surfaced.

Original648-word source remains in `js/words.js`; all648stable IDs are preserved in metadata. The original50held items remain held, plus five specific Hong Kong landmark/weather-warning concepts retired from new draws. The other593existing concepts plus420additions form the current1013candidate bank. Children’s familiarity, translation quality and difficulty need human playtesting.

## Local commands

Node 22+ (tested here with Node 25). From this repository:

```sh
npm ci --ignore-scripts
python3 scripts/import-layerlab.py
npm test
npm run serve
# http://127.0.0.1:8765/
npm run build
npm run ios:sync
```

Use the built dist preview for cross-browser development: locale JSON imports are bundled for the supported iOS/WebKit target. `dist/` is the distributable allowlisted build; do not upload the repository root. `npm run build` bundles the optional native bridge and does not include tests, audit files, the source word archive or node_modules.

## iOS

Capacitor 8.5.3 with the App plugin; Xcode project: `ios/App/App.xcodeproj`. Bundle identifier `com.local.familydraw` is a **local test placeholder**. No developer team is selected. Native scene handling covers app-switcher snapshots and pauses play; idle lock is disabled only while playing in the foreground.

```sh
npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ../v1-checks/DerivedData CODE_SIGNING_ALLOWED=NO build
```

Full Xcode/toolchain and simulator runtime must already be installed. Simulator build/launch is not physical-device or App Store acceptance. Signing, account setup and publishing require separate authorization.

## Storage and privacy

V1 owns `sg_v1_profile`, `sg_v1_game`, `sg_v1_last`. Original `pp_*` keys are read for compatible finite-game migration only (legacy endless games remain preserved for export rather than silently changing their rules) and are never overwritten or deleted. Invalid V1 raw values block writes to that key, remain available in Settings backup, and require explicit reset. Reset only deletes the three V1 keys. No account, analytics, remote API, third-party font or ad SDK is present. Browser and app containers do not automatically share saves.

Canvas stores vector strokes, not photos. A round has bounded strokes/points; a visible warning appears when the cap is reached. Export includes in-memory state and original raw keys; users should treat their backup as private. Native backup export compatibility still needs device validation.

## Web caching and deployment

Service worker installs one asset set, waits for old controlled tabs to close, and uses its versioned cache first. Cleanup is scoped to `pictionary-party-*`. Bump the cache version whenever distributable content changes. Deploys still trigger on pushes to `main`, `master`, `claude/**`, or manual dispatch. Workflow now tests/builds and uploads only `dist/`; it has not been run remotely. This local branch is `codex/family-draw-v1` and is not one of those push triggers.

## Visual assets and limits

Three original cat illustrations, a matching app icon and the layout accompany 102 Layer Store GUI Pro — Simple Casual components for buttons, panels and functional icons. The original character files have a separate integrity manifest. Import the licensed archive locally with `python3 scripts/import-layerlab.py [archive-path]`; binaries are deliberately ignored by Git. `scripts/layerlab-assets.json` records names, source paths and hashes. Build requires these local files, so a fresh clone/remote workflow needs a separately authorized private asset provisioning step. Do not publish raw assets or the archive. No pack pixels were supplied to generative tools; final appearance needs human visual acceptance. See workspace `LAYERLAB-INTEGRATION.md`.

Physical iPhone/iPad touch, Apple Pencil, interruptions, audio, accessibility, actual family tests and commercial name/content review remain release gates. See workspace `V1-SPEC.md`, `V1-STATUS.md` and `v1-checks/` for evidence and limitations.

## Dependency note

Capacitor CLI's `xcode` package uses `uuid.v4()` only. The project overrides its uuid dependency to 11.1.1 to remove the reported vulnerable older dependency; parsing/UUID generation and native sync/build were checked. No `npm audit fix --force` was used.

## LayerLab A Batch 1 candidate (2026-10-13)
Generated slicing CSS is required and gitignored. Import81approved assets locally before build. The full pack skin now covers cards/lists/tabs/avatar frames/timer/dialogs and semantic icons; `js/ui-icons.mjs` is only a fallback. Use the built dist preview on8766 or the fixed local candidate guide in the workspace. Dist worker precaches all manifest assets and generated slices, and reads caches without reopening retired ones. Source8765 is a development surface, not the offline distribution acceptance target. See BATCH-1-REVIEW-GUIDE.md for version, private preservation scope, receipts and human review. No licensed pixels were given to models.


## iPhone UI/UX refinement (2026-10-13)
Phone layouts are in css/iphone-ux.css, loaded after the common pack skin. Short landscape uses a vertical drawing toolbar and two-column private handoff/reveal; portrait reserves room for timer/peek and score/skip actions. The first-play guide has a short-landscape layout. Dynamic Type reflows instead of fixing large text to viewport height. Key drawing labels are at least the15px secondary token, primary actions18px. The form renderer preserves drafts/focus; dialogs return focus and the background privacy cover makes underlying content inert.

Pointer input preserves fast release endpoints, rejects right clicks and commits an active stroke before rotation changes coordinates. Existing normalized strokes, point limits, schema and game rules remain unchanged. New tests: tests/iphone-ux-browser.cjs (600 geometry/flow/state checks with simulated safe areas and1×/2×/3.12× text), tests/iphone-canvas-input.cjs (six pointer cases) and tests/iphone-paper-browser.cjs (eight bilingual phone configurations). These are isolated browser checks, not physical iPhone/Pencil/VoiceOver acceptance. Full receipts and fixed-candidate comparison remain outside this repo.


## Landing page and action clarity (2026-10-13)
Home now explains pass-and-play before starting, labels the first quick game as two players, previews the actual settings, and separates saved-game continuation from setup. Supporting How to play / My words / Last game actions explain their destinations. No account or sign-in feature was introduced.

Primary/secondary actions use balanced icon gutters and symmetric vertical padding; selected options keep their labels centered. Three more Simple Casual icons (home, add, download) are locally imported, bringing the manifest to86. The eraser has an original filled SVG fallback because the pack contains no eraser, with a short localized caption and full accessible name. The narrow-phone skip label is shorter to keep the drawing space usable. No gameplay, storage, or canvas document changes. See workspace LANDING-UI-REVIEW-2026-10-13.md for evidence and the next fixed preview.


## Reference-inspired lobby (2026-10-13)
Home now groups the original cat, short welcome headline and shared-device explanation in a sky-coloured scene. How to play and My words use larger icons and distinct colour accents; Last game remains a full-width destination when available. Phone portrait stacks the welcome and start areas; short landscape and tablet place them side by side. Larger text stacks cards and prioritizes live text. Buttons retain the LayerLab skin and centered labels. Only the home renderer/copy and home-specific layout changed; the user reference images are kept outside the repository and never ship. See workspace REFERENCE-UI-REVIEW-2026-10-13.md.


## Full clubhouse UI overhaul (2026-10-13 — current)
Stephen rejected the bounded-banner iteration above as too similar to a web page. The current UI replaces that composition: full-screen original drawing-club environment, large live-text wordmark and character, one dominant play/resume button, and a bottom destination dock. Setup uses a numbered trail and illustrated choice tiles; handoff is a character stage; the secret is a large paper ticket; results and final use larger character/score/art composition. Portrait drawing puts the paper directly below the HUD and tools below the paper; landscape retains the side tool rail. Loading and retry surfaces share the same environment.

`css/game-ui.css` is the final layout layer after `iphone-ux.css`, before reduced-motion-aware `motion.css`. English headings use rounded system display typography; Chinese uses the system/PingFang fallback. Live text, accessible actions, saved-game continuation and large-text reflow remain. No account, scoring, storage schema or drawing document changes. The three original character files and all86licensed components are retained unchanged. `assets/scenes/drawing-club-v1.png` is new original built-in ImageGen artwork using only the original cat as a style reference; its integrity metadata is in `scripts/scene-assets.json` and it is included offline and natively. User reference images and paid GUI pixels were not sent to generation. The previous8781candidate remains available for comparison; see workspace FULL-UI-OVERHAUL-2026-10-13.md for the current fixed candidate and evidence. This is a new visual candidate, not human/device acceptance of a finished paid game.


## Bundled game typography and Picto readability (2026-10-13 — current)
The current typography is Fredoka for English display/actions, Rubik for English body, and full GenSen Rounded2TWMedium/Bold for Traditional Chinese, replacing the system-only stacks described in older checkpoints. OFL notices ship in assets/fonts; scripts/font-assets.json pins source revisions, full glyph coverage and hashes. css/fonts.css is loaded before layout, with family choices in css/tokens.css. All font files are local/offline/native assets and validated before dist updates.

The importer now declares102LayerLab components:16LightPicto128additions replace colourful ItemIcons in functional use while preserving all86older assets. packIcon renders a decorative i wrapper with an absolute CSS-mask URL, retaining an image for asset readiness. This avoids interfering with live span labels such as peek. Original filled eraser/curved undo/redo cover symbols absent from the pack. Concrete control faces provide contrast, equal gutters centre button labels and screen headings, and large text reflows. tests/readability-browser.cjs checks actual mask URLs, font loading, control contrast and heading/label geometry in Chromium/WebKit. Full local evidence and candidate reference: workspace TYPOGRAPHY-ICONS-REVIEW-2026-10-13.md. Physical-device and human visual acceptance remain open; no release is authorized.


## Player routes, full artwork export and themed decks (2026-10-13 — latest)

Home now separates Quick Play (2-player co-op, easy built-ins, on-screen,60seconds,6turns), Set up game and Settings. Quick Play preserves saved setup; active-game replacement remains confirmed. Easy mixed decks exclude ungraded custom words; explicit custom decks still use all entered words.

Result/recap drawings open a Save / share sheet. Native add-only Photos saving and the system share sheet return explicit success/cancel/denied/failure states. Export is player strokes only: PNG1600×1600 or legacy1600×1200. Browser review downloads the PNG or uses supported file sharing. No UI/name/word/score screenshot is exported.

Full completed strokes live in independent IndexedDB `sg_artwork_v1`, retained without pruning; localStorage rules/schema and original keys remain unchanged. Last-game export reads the full archive first, with an explicit older-preview fallback. Settings backup includes this archive (or marks its absence if inaccessible); the20MBlimit is reported. Reset keeps the separate archive and legacy data, as stated in confirmation. Existing UI still shows the latest completed game.

Content:648retained/598active/50held/219easy candidates;34difficulty corrections with reasons. Transport20/easy13 and Space12/easy7 are stable-ID collections, not duplicated words. All topic icons use LayerLab Picto;4new files bring the manifest to106. New artwork PNG/IDB/permission-contract tests accompany existing UI checks. See workspace PLAYER-FLOW-ARTWORK-REVIEW-2026-10-13.md and current fixed preview receipt. Actual device Photos/share operations and family difficulty acceptance remain open.


Local regional language checkpoint (2026-10-14): Hong Kong and Taiwan are distinct choices. `zh` and legacy `both` keep prior meaning; `zh-TW` is a source-bound derived catalog. After content edits run `node scripts/content.mjs`, then `npm test` and `npm run build`. The generator requires a regional decision for every shipped label. Other regional variants and native-speaker acceptance are still pending. Local candidate8800; no release/deployment.


Western regional editions (local8801,2026-10-14): US/UK English, Brazil/Portugal Portuguese, Spain/Mexico Spanish. `locales` includes legacy codes; `selectableLocales` is the reviewed new-choice list. Regional authoring uses complete per-ID source/text/reason records in scripts/regional-*.json and requires regeneration plus tests/build. Preserve old generic dictionaries for exact saved/custom text behaviour.15 selectable regions/languages,18 valid stored codes; no deployment or mother-tongue acceptance.


## Free edition and lifetime unlock (2026-10-14)

New games without a verified StoreKit entitlement use the fixed 50-card mixed selection. Full access uses non-consumable `com.local.familydraw.fullversion`, including future app updates. Local StoreKit configuration: `ios/App/FullGame.storekit`, US$1.99. App Store Connect product/price setup is still required for real sales. No entitlement is stored in profiles or backups. Existing saved games/artwork/custom text are preserved.

Run `python3 scripts/create-purchase-qa.py` to generate an isolated native StoreKit test project outside this repo. See the workspace's `PURCHASES-REVIEW-2026-10-14.md` for exact evidence, retained simulator cancellation limitations and real-device gates. Select FullGame.storekit manually under Xcode Edit Scheme → Run → Options for local purchase testing; the ordinary scheme is not silently changed.
