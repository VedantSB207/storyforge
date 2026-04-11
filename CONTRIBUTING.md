# Contributing to StoryForge

Thanks for taking an interest in StoryForge. This doc covers how to get a local dev environment running, the project layout, and the workflow for proposing changes.

StoryForge is an Electron + Vite + React desktop app that uses the Anthropic Claude API to assist with creative writing. All user data lives locally — nothing is sent to any server except Anthropic for AI calls.

---

## 1. Prerequisites

| Tool | Minimum version | Check |
|---|---|---|
| Node.js | 18 | `node --version` |
| npm | 9 | `npm --version` |
| macOS | 12 (Monterey) | for `npm run build:mac` |
| Anthropic API key | any | from [console.anthropic.com](https://console.anthropic.com) |

On macOS, install Node via Homebrew if you don't have it:

```bash
brew install node
```

Linux and Windows development works for everything except the `.app` packaging step, which is macOS-only right now.

---

## 2. Getting the code

```bash
# Fork on github.com/VedantSB207/storyforge first, then:
git clone https://github.com/YOUR_USERNAME/storyforge.git
cd storyforge
npm install
```

---

## 3. Running in dev mode

**Electron mode (recommended — full persistence, real IPC):**

```bash
npm run dev:electron
```

This boots Vite on :5173, starts the Express proxy, waits for Vite, then launches an Electron window. On first run you'll see the setup screen — paste your Anthropic API key. It's stored in `~/Library/Application Support/StoryForge/config.json` (macOS) and never leaves your machine.

**Browser mode (quick UI work only — no persistence):**

```bash
npm run dev
```

Opens at `http://localhost:5173`. Everything resets on refresh. Don't use this for features that depend on file I/O or project storage.

---

## 4. Project layout

```
storyforge/
├── electron/
│   ├── main.js        Electron main process — windows, IPC handlers, file I/O,
│   │                  project persistence, library management
│   └── preload.js     contextBridge → window.api.* in the renderer
├── src/
│   ├── App.jsx        Main React app (~3000 lines — ProjectHub, MindMap,
│   │                  RelationshipWeb, WritingPanel, LibraryPanel,
│   │                  ImportAnalyse, StoryBible, etc.)
│   ├── main.jsx       React entry
│   ├── api.js         callClaude wrapper (routes to Electron IPC or /api/claude)
│   ├── BlueprintReview.jsx         Post-analysis review screen
│   ├── CharacterStoryAnalyser.js   Manuscript → characters/lore extraction
│   └── CharacterIdentityResolver.js  Dedupe logic (Levenshtein + AI fallback)
├── assets/            App icon + iconset
├── index.html         Vite HTML entry
├── vite.config.js     Vite + dev proxy config
├── server.js          Express proxy for browser dev mode
└── package.json       Scripts, deps, electron-builder config
```

Data at runtime lives outside the repo, in the Electron userData dir:

```
~/Library/Application Support/StoryForge/
├── config.json              API key + settings
└── projects/
    ├── <projectId>.json     one file per project
    └── <projectId>/library/ imported manuscript files per project
```

---

## 5. Making changes

### Branch naming

- `feat/<short-description>` — new feature
- `fix/<short-description>` — bug fix
- `docs/<short-description>` — documentation only
- `refactor/<short-description>` — internal restructuring, no behavior change
- `chore/<short-description>` — tooling, deps, config

### Commit messages

Use present-tense imperative, one-line summary under 72 chars, optional body:

```
feat: add cover generator to writing panel

Uses Claude to produce three cover concepts from the project logline.
Persists selection to project.meta.coverConcept.
```

### Before opening a PR

1. Run the app locally in Electron mode and verify your change actually works end-to-end.
2. For changes to `src/App.jsx`, test:
   - Creating a new project
   - Importing a `.docx` and running Analyse
   - Saving and reloading (close/reopen app) — confirms persistence didn't break
3. For Electron IPC changes, confirm **both** `electron/preload.js` and `preload.js` are in sync if you edit either (there are two files, kept identical by convention).
4. For dashboard-like HTML files with inline JS, check syntax with Node before committing:
   ```bash
   node --check <file>.js
   ```

### Code style notes (things that have bitten us before)

- **Never use template literals inside `.map()` callbacks in HTML files** — use string concatenation. Past outages traced back to this.
- **Never use Unicode symbols (▲ ▼ —) inside JS strings** rendered in HTML — use HTML entities.
- Always `cp file.jsx file.jsx.bak` before a large rewrite of a hot file.
- One risky change per commit. Don't bundle three refactors with a feature.

---

## 6. Opening a pull request

1. Push your branch to your fork.
2. Open a PR against `VedantSB207/storyforge:main`.
3. In the PR description, include:
   - **What** changed
   - **Why** (link to issue if there is one)
   - **How to test** — exact steps a reviewer should follow in the running app
   - Screenshots or screen recordings for UI changes

Small PRs get reviewed faster. If a change touches more than ~300 lines across unrelated areas, split it.

---

## 7. Reporting bugs

Open an issue at https://github.com/VedantSB207/storyforge/issues with:

- **Version**: output of `git rev-parse HEAD` from the checkout you hit the bug on
- **OS**: macOS / Linux / Windows + version
- **Mode**: Electron or browser
- **Steps to reproduce** — numbered, ideally starting from an empty project
- **Expected vs actual**
- **Logs** — for Electron, open DevTools (View → Toggle Developer Tools) and copy the Console tab

If the bug involves a specific manuscript file, DO NOT attach the manuscript unless you're comfortable making it public. Instead describe its structure (chapter count, approximate word count, number of characters in it).

---

## 8. Proposing features

Open a Discussion first (GitHub Discussions tab) rather than a PR. Describe:

- The writing workflow problem you're trying to solve
- How you'd want it to work inside StoryForge
- What it replaces or complements (Import & Analyse? Story Bible? Writing Panel?)

We'll talk it through before anyone writes code, so you don't spend a weekend on something that collides with work already in flight.

---

## 9. License

By contributing, you agree that your contributions will be licensed under the same MIT License that covers the project. See `LICENSE`.

---

## 10. Questions

Open a Discussion or reach out to Vedant at `vedant@bwits.tech`.
