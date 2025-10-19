# City Master — Turn‑Based LAN City Builder

A fast, small‑map, turn‑based city builder you can play over LAN with friends. Gather, build, advance through the ages (Wood → Stone → Modern), defend against seasonal raids, trade or scheme, and race to complete your civilization’s Monument.


## Features
- Snappy, LAN‑first multiplayer with Socket.IO
- Three Ages with unique buildings and yields
- Seasonal modifiers and narrative events
- Raids: tribal attacks and player raids (plus mercenary hires)
- Visitors: trader, spy, robber — diplomacy each season
- Modernized UI, textures and toasts; mobile‑friendly victory screen
- Persistent session logs with end‑game narrative summary
- Optional AI players for quick matches


## Quick Start
1) Requirements: Node.js 18+ (recommended), npm
2) Install deps:

```bash path=null start=null
npm install
```

3) Run the server (defaults to port 3000):

```bash path=null start=null
npm start
# or
node server.js
```

4) Open the game in a browser:
- http://localhost:3000
- Share your machine’s IP on the same network for LAN play

To change the port:

```bash path=null start=null
# Windows / macOS / Linux
set PORT=4000 && node server.js
# or
PORT=4000 npm start
```


## How to Play (TL;DR)
- Goal: be first to build your Monument (appears in Modern after prerequisites).
- Each turn you get Moves (AP). Spend them to gather, build/upgrade, train, raid, or trade.
- Seasons change automatically with time; each season modifies resource yields.
- Raids can hit once per season; keep defense high and walls sturdy.
- Trade via the Trade modal; send Visitors once per season.
- End your turn to pass play; banked Moves carry to your next turn (up to a cap).

A fuller guide lives in public/guide.html (in‑game “How to Play” link).


## Game Systems
- Ages: progress by constructing enough buildings in your current age.
- Buildings: yield resources, improve defense/raid power, or unlock features.
- Training: recruits soldiers in batches; food/coins cost scales by age.
- Defense: walls + soldiers + structures contribute to percent defense.
- Raids:
  - Tribal raids: at most one per season. Outcomes: defended, resource loss, devastation (buildings destroyed).
  - Player raids: dispatch your army; resolve next season (success/defeat with loot/losses).
  - Mercenaries: pay coins to guarantee a raid at season end against a target.
- Visitors (once per season): trader, spy (disguised), robber (disguised). Recipient sees “trader,” outcomes vary.


## End‑Game Summary and Logs
- A session log is written to logs/session_<ROOM>.txt (created on room start).
- The game over payload parses that log to reconstruct:
  - Total turns, tribal raids, first to reach Stone/Modern, monument unlocks
  - Plus per‑player stats captured during play
- The Victory screen composes a mobile‑friendly “Epic Chronicle” from those facts.

Log samples are in logs/. If you end the server early, logs reflect events written so far.


## Commands (for testing/balancing)
Type in chat:

```bash path=null start=null
/help
/add <amount> <resource> <player>   # resource: wood|rock|metal|food|coins|all
/remove <amount> <resource> <player>
/raid <player>
```

Examples:

```bash path=null start=null
/add 100 all me
/remove 10 rock Player28
/raid Bob
```


## Folder Structure
- server.js: Express + Socket.IO game server and logic
- public/
  - index.html: lobby + game UI
  - styles.css: themes, toasts, gather buttons, etc.
  - client.js: client state, UI updates, modals, event feed, victory screen
  - guide.html: “How to Play”
  - media/: images and effects (e.g., Dispatched.png, raid art)
  - music/: age‑based background tracks
- logs/
  - session_<ROOM>.txt: per‑game session log
  - ai_<ROOM>.txt: AI actions (if AI in room)


## Development
- Tech: Node (ESM), Express, Socket.IO, vanilla JS/CSS/HTML
- Hot reload: not included; restart node on server changes
- Linting/Typecheck: not configured by default

Recommended workflow:

```bash path=null start=null
# run
node server.js
# edit public/* and refresh browser
```


## LAN Tips
- Ensure all players can reach your host IP and port
- Firewalls may block; allow Node/port through


## Troubleshooting
- Music too loud: client clamps max music volume to 20%
- No end‑game narrative: the session log finalization occurs at game over; ensure the room reached victory
- Missing media: check public/media asset filenames (case‑sensitive on some hosts)


## License
Proprietary — for personal/internal use with the City Master game unless you have been granted additional rights.
