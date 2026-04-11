# StoryForge

Narrative intelligence engine — writing, simulation, and production pipeline.

---

## Running as a Mac App (Electron)

### Prerequisites

Open Terminal and check:

```bash
node --version   # needs v18 or higher
```

If missing or old:
```bash
brew install node
```

Don't have Homebrew? Run this first:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

---

### Setup (one time only)

```bash
# 1. Move into the project folder
cd ~/Downloads/storyforge

# 2. Install all dependencies
npm install

# 3. Start in Electron mode
npm run dev:electron
```

The app opens as a native Mac window. On first launch it shows a setup screen — enter your Anthropic API key (from console.anthropic.com → API Keys). The key is stored locally on your Mac, encrypted, never sent anywhere except directly to Anthropic.

That's it. Your projects, characters, lore, and timelines are all saved automatically to:
`~/Library/Application Support/StoryForge/projects/`

---

### Building a distributable .app

When you're ready to share or distribute:

```bash
# You'll need a free icon first — see Assets section below
npm run build:mac
```

This creates:
```
release/
  StoryForge-0.1.0-arm64.dmg   ← Apple Silicon (M1/M2/M3)
  StoryForge-0.1.0-x64.dmg     ← Intel Mac
```

Double-click the `.dmg` to install like any Mac app.

---

### Assets needed for the .app build

electron-builder needs two files in `/assets/`:

**icon.icns** — Mac app icon
- Make a 1024×1024 PNG of your logo
- Convert at: cloudconvert.com/png-to-icns
- Save as `assets/icon.icns`

**dmg-background.png** — installer background (optional)
- 660×400 PNG
- Save as `assets/dmg-background.png`
- Without it the build still works, just plain background

---

### Running in browser (dev only)

If you want to test in a browser instead of the app:

```bash
npm run dev
```

Opens at `http://localhost:5173`. Uses the Express proxy for API calls. No persistence — everything resets on refresh. For real use, always use Electron mode.

---

### Project structure

```
storyforge/
├── electron/
│   ├── main.js        # Electron main process — window, IPC, file reading, persistence
│   └── preload.js     # Context bridge — exposes safe APIs to React
├── src/
│   ├── App.jsx        # Full StoryForge React app
│   ├── api.js         # Claude API abstraction (Electron IPC or browser fetch)
│   └── main.jsx       # React entry point
├── assets/            # App icon + DMG background (add before building)
├── index.html         # Vite entry
├── vite.config.js     # Vite + proxy config
├── server.js          # Browser dev proxy (not used in Electron mode)
└── package.json
```

---

### Where your data lives

All project data is saved locally on your Mac:

```
~/Library/Application Support/StoryForge/
├── config.json              # Settings (API key, encrypted)
└── projects/
    ├── abc123.json          # Each project = one JSON file
    ├── def456.json
    └── ...
```

You can back this up, copy it to another Mac, or open the JSON files directly. Nothing is in the cloud.

---

### Troubleshooting

**`npm install` fails with permissions error**
```bash
sudo chown -R $(whoami) ~/.npm
npm install
```

**App opens but AI features don't work**
- Check your API key: launch app → if no setup screen appeared, delete config:
  `rm ~/Library/Application\ Support/StoryForge/config.json`
  then restart the app

**`electron` command not found after install**
```bash
./node_modules/.bin/electron .
```

**Port 5173 already in use**
```bash
lsof -ti:5173 | xargs kill
npm run dev:electron
```

**Build fails: icon not found**
- Add `assets/icon.icns` (see Assets section above)
- Or temporarily remove the `"icon"` line from `package.json` build config

---

### Next steps

- [ ] Add your Anthropic API key on first launch
- [ ] Create your first project
- [ ] Add characters to the Story Bible
- [ ] Run a simulation with the Conspiracy Engine
- [ ] Test Import & Analyse with an existing manuscript
