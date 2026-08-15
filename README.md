# 🎨 Pictionary Party

A single-device **Pictionary host console** for game night — designed for
iPad, fully usable on iPhone too. The screen shows the word to the drawer,
runs the round timer, and lets you tap whoever guessed correctly — scoring
is automatic.

No installs, no accounts, no server: it's a plain HTML/CSS/JS web app that
works offline once loaded.

**Live app:** https://ngzzzho.github.io/Pictionary/

## How a round works

1. **Register players** on the setup screen (names are remembered for next
   time; a fresh device starts with the family roster pre-loaded).
2. Pick a **topic** — Animals 🐾, Occupations 💼, Sports ⚽, Food 🍕,
   Everyday Things 🏠, your own My Words ✏️ list, or Mixed 🎲 — plus the
   **round time** (30/60/90/120s) and how many times each player draws.
   Every built-in word passes the "a 7-year-old knows it and can recognize
   the drawing" test.
3. The app announces whose turn it is: **pass the iPad to the drawer**, who
   taps to secretly reveal the word — shown in English with the
   **Traditional Chinese (Hong Kong) label underneath** (e.g. PINEAPPLE BUN
   菠蘿包), so young kids can read it too. Too hard? Swap it — but only
   **once per round**, and never after the timer starts.
4. **Start drawing** — a "go" chime kicks off the countdown ring, ticks count
   down the last 10 seconds (urgent in the last 5), and a buzzer sounds at
   zero. Tap the timer to pause.
5. When someone shouts the right answer, **tap that player's tile**:
   the guesser gets **+1** and the drawer gets **+1** (classic rules), with
   a confetti burst 🎊. Mis-tapped? There's an Undo. Nobody got it? Tap 🏳️.
6. The drawer **rotates automatically** each round. At the end you get final
   standings with a winner celebration 🏆 and a **word recap** of every
   round — who drew what and who guessed it.

Handy details:

- **My Words** ✏️: build a custom topic right in the app (family jokes,
  Cantonese-culture words, cartoon characters…). Saved on the device; five
  words or more makes it playable, and custom words join the Mixed deck.
- **Hold-to-peek** button during a round lets the operator check the word
  without showing it to everyone.
- Words are shuffled and **don't repeat** until the whole deck is used up.
- The game **auto-saves** — if Safari reloads the page, you can resume where
  you left off.
- The screen is kept awake during a game (Wake Lock, iPadOS 16.4+).
- Sound can be muted from the top bar.

## Using it on your iPad

Open the live URL in Safari, then **Share → Add to Home Screen** to get a
full-screen app with its own paint-palette icon. It's a full PWA: after the
first load it **works offline** — no Wi-Fi needed at the party.

## Hosting / deployment

Pushes to `main`/`master` (and `claude/**` branches) auto-deploy via the
GitHub Actions workflow in `.github/workflows/deploy.yml`.

One-time setup by the repo owner (the workflow cannot do this itself on a
private repo):

1. GitHub Pages needs a **public** repo on GitHub's Free plan. Either make
   this repo public (**Settings → General → Danger Zone → Change visibility**)
   or use a paid plan. Note that a Pages site is publicly reachable either way.
2. **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
3. Re-run the *Deploy to GitHub Pages* workflow from the **Actions** tab (or
   push any commit). The app goes live at the URL above.

Run it locally by opening `index.html`, or:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Customizing word lists

Quick additions: use the in-app **My Words** topic. For permanent topics,
edit `js/words.js` — each topic is just a key with a label, an emoji, and a
word list; add a new topic and the app (including the Mixed deck) picks it
up automatically. Keep words kid-friendly and drawable.

After changing `sw.js`'s cached asset list, bump its `CACHE` version string
so installed iPads pick up the new files.

## Roadmap ideas

- [x] Custom word lists editable in-app (saved on the device) — *My Words*
- [x] More topics — *Food, Everyday Things*
- [x] Full offline PWA install (service worker + manifest + icons)
- [x] Round-by-round word recap at the final screen
- [ ] Team mode (two teams, alternating drawers)
- [ ] Speed bonus scoring (more points for faster guesses)
- [ ] In-app drawing canvas + AirPlay mirroring to a TV
- [ ] Multi-device buzzer mode (players join from their phones with a room code)
- [x] Bilingual EN/中文 word cards (Hong Kong Cantonese vocabulary)
- [ ] Word difficulty tiers with bonus points
- [ ] Game-night history and stats
