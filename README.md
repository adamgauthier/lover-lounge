# 💕 Lover Lounge

An interactive timelapse visualization of the **Lover Lounge** chain event on Discord (powered by [TaylorBot](https://github.com/adamgauthier/TaylorBot)).

View the live website at **[adamgauthier.github.io/lover-lounge 🔗](https://adamgauthier.github.io/lover-lounge)**!

## What is Lover Lounge?

Lover Lounge is a Valentine's Day event where members spread love by passing a special role through the server, giving access to a private #lover-lounge channel. One person starts as the "lover" and shares it with someone else, who then shares it with the next person, forming growing chains over multiple days.

This visualization replays the chain growth as an animated timelapse: watch chains form, compete, and grow in real-time!

## Features

- 🎬 Animated timelapse of chain growth with smooth transitions
- 🏆 Live leaderboard showing chain sizes as they grow
- 🎨 Color-coded chains for easy identification
- ⏯️ Playback controls: play/pause, speed (1×–8×), scrub, step through
- 🔍 Zoom and pan with mouse, auto-follow newest node
- 📅 Multi-year support: switch between events with the year selector
- 💻 Fully client-side — no server needed

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `→` | Step forward |
| `←` | Step backward |
| `F` | Re-enable auto-follow |

## Data

Each year's data is a CSV file in `data/` with the following columns:

| Column | Description |
|--------|-------------|
| `username` | Discord username of the member |
| `acquired_from_username` | Who they received the role from |
| `acquired_at` | Timestamp of when they received it (UTC) |

## Running Locally

Serve the files with any static HTTP server:

```bash
docker run --rm -p 8080:80 -v "$(pwd):/usr/share/nginx/html:ro" nginx:alpine
```

Then open http://localhost:8080.

## License

[MIT](LICENSE)
