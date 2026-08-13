# 🎨 Pictionary Party

A single-iPad **Pictionary host console** for game night. The iPad shows the
word to the drawer, runs the round timer, and lets you tap whoever guessed
correctly — scoring is automatic.

No installs, no accounts, no server: it's a plain HTML/CSS/JS web app that
works offline once loaded.

**Live app:** https://ngzzzho.github.io/Pictionary/

## How a round works

1. **Register players** on the setup screen (names are remembered for next time).
2. Pick a **topic** — Animals 🐾, Occupations 💼, Sports ⚽, or Mixed 🎲 —
   plus the **round time** (30/60/90/120s) and how many times each player draws.
3. The app announces whose turn it is: **pass the iPad to the drawer**, who
   taps to secretly reveal the word (swap it if it's too hard).
4. **Start drawing** — the countdown ring runs, with tick sounds in the last
   5 seconds and a buzzer at zero. Tap the timer to pause.
5. When someone shouts the right answer, **tap that player's tile**:
   the guesser gets **+1** and the drawer gets **+1** (classic rules).
   Mis-tapped? There's an Undo. Nobody got it? Tap 🏳️.
6. The drawer **rotates automatically** each round. At the end you get final
   standings with a winner celebration 🏆.

Handy details:

- **Hold-to-peek** button during a round lets the operator check the word
  without showing it to everyone.
- Words are shuffled and **don't repeat** until the whole deck is used up.
- The game **auto-saves** — if Safari reloads the page, you can resume where
  you left off.
- The screen is kept awake during a game (Wake Lock, iPadOS 16.4+).
- Sound can be muted from the top bar.

## Using it on your iPad

Open the live URL in Safari, then **Share → Add to Home Screen** to get a
full-screen, app-like experience.

## Hosting / deployment

Pushes to `main`/`master` (and `claude/**` branches) auto-deploy via the
GitHub Actions workflow in `.github/workflows/deploy.yml`. The workflow tries
to enable GitHub Pages by itself on first run; if the deploy step fails, enable
it once manually: **Settings → Pages → Source: "GitHub Actions"**, then re-run
the workflow.

Run it locally by opening `index.html`, or:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Customizing word lists

Edit `js/words.js`. Each topic is just a key with a label, an emoji, and a
word list — add a new topic and the app (including the Mixed deck) picks it
up automatically.

## Roadmap ideas

- [ ] Custom word lists editable in-app (saved on the device)
- [ ] Team mode (two teams, alternating drawers)
- [ ] Speed bonus scoring (more points for faster guesses)
- [ ] In-app drawing canvas + AirPlay mirroring to a TV
- [ ] Multi-device buzzer mode (players join from their phones with a room code)
- [ ] More topics (Movies, Food, Places, Idioms) and bilingual EN/中文 word lists
- [ ] Word difficulty tiers with bonus points
- [ ] Game-night history and stats
- [ ] Full offline PWA install (service worker + manifest)
