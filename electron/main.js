import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

// ── Storage setup ─────────────────────────────────────────────────────────────
// electron-store for settings (API key etc.)
const Store = require('electron-store')
const store = new Store({
  encryptionKey: 'storyforge-v1', // basic obfuscation for API key
  defaults: { apiKey: '', projectIndex: {} }
})

// Project files live in userData/projects/
const projectsDir = path.join(app.getPath('userData'), 'projects')
if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir, { recursive: true })

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',  // macOS native feel — traffic lights inside window
    vibrancy: 'under-window',
    backgroundColor: '#09090c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Open external links in browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: API Key ──────────────────────────────────────────────────────────────
ipcMain.handle('get-api-key', () => store.get('apiKey'))

ipcMain.handle('set-api-key', (_, key) => {
  store.set('apiKey', key.trim())
  return { ok: true }
})

// ── IPC: Claude API proxy ─────────────────────────────────────────────────────
ipcMain.handle('call-claude', async (_, payload) => {
  const apiKey = store.get('apiKey')
  if (!apiKey) return { error: 'no_key', message: 'API key not set. Go to Settings to add it.' }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    })
    const data = await response.json()
    if (!response.ok) {
      return { error: 'api', message: data?.error?.message || `API returned ${response.status}`, status: response.status }
    }
    return data
  } catch (err) {
    return { error: 'network', message: err.message }
  }
})

// ── IPC: File reading ─────────────────────────────────────────────────────────
// Opens native macOS file picker and extracts text from all selected files
ipcMain.handle('read-files', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Story Documents',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Story Documents', extensions: ['txt', 'md', 'docx', 'pdf'] },
      { name: 'Text Files', extensions: ['txt', 'md'] },
      { name: 'Word Documents', extensions: ['docx'] },
      { name: 'PDF Files', extensions: ['pdf'] },
    ],
  })

  if (canceled || filePaths.length === 0) return []

  const results = []

  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase()
    const name = path.basename(filePath)
    const stats = fs.statSync(filePath)

    try {
      if (ext === '.txt' || ext === '.md') {
        const content = fs.readFileSync(filePath, 'utf8')
        results.push({ name, content, size: stats.size, type: ext.slice(1) })

      } else if (ext === '.docx') {
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ path: filePath })
        results.push({ name, content: result.value, size: stats.size, type: 'docx' })

      } else if (ext === '.pdf') {
        // Stream-based PDF extraction — handles large files without memory spike
        const pdfParse = require('pdf-parse')
        const buffer = fs.readFileSync(filePath)
        const data = await pdfParse(buffer)
        results.push({
          name, content: data.text, size: stats.size,
          type: 'pdf', pages: data.numpages
        })
      }
    } catch (err) {
      results.push({ name, content: '', size: stats.size, type: ext.slice(1), error: err.message })
    }
  }

  return results
})

// ── IPC: Project persistence ──────────────────────────────────────────────────
// List all projects (fast — reads index only)
ipcMain.handle('list-projects', () => {
  return store.get('projectIndex', {})
})

// Save a project (index entry + full data file)
ipcMain.handle('save-project', (_, { id, data }) => {
  try {
    // Update index
    const index = store.get('projectIndex', {})
    index[id] = {
      id: data.id,
      title: data.title,
      genre: data.genre,
      status: data.status || 'planning',
      lastEdited: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    }
    store.set('projectIndex', index)

    // Write full project data to its own file
    const filePath = path.join(projectsDir, `${id}.json`)
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Load a project's full data
ipcMain.handle('load-project', (_, id) => {
  try {
    const filePath = path.join(projectsDir, `${id}.json`)
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
})

// Delete a project
ipcMain.handle('delete-project', (_, id) => {
  try {
    const index = store.get('projectIndex', {})
    delete index[id]
    store.set('projectIndex', index)
    const filePath = path.join(projectsDir, `${id}.json`)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Get userData path (so writer can find their files if needed)
ipcMain.handle('get-data-path', () => app.getPath('userData'))

// ── IPC: Ollama (Phase 4a) ───────────────────────────────────────────────────
// HTTP wrapper around an Ollama server (local or VPS). The renderer never
// touches the URL directly — keeps CORS clean and lets the URL be configured
// server-side. Health-check mode pings /api/tags; decision mode posts to
// /api/generate with stream:false and short JSON response.
//
// Never throws. Returns { ok, response?, error? } envelope.
ipcMain.handle('query-ollama', async (_, { url, model, prompt, healthCheck, timeout }) => {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), timeout || 10000)
  try {
    if (healthCheck) {
      const res = await fetch(`${url}/api/tags`, { signal: controller.signal })
      clearTimeout(tid)
      if (!res.ok) return { ok: false, error: `health_check_${res.status}` }
      return { ok: true }
    }
    const res = await fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.7, num_predict: 120 },
      }),
      signal: controller.signal,
    })
    clearTimeout(tid)
    if (!res.ok) return { ok: false, error: `http_${res.status}` }
    const data = await res.json()
    return { ok: true, response: data?.response || '' }
  } catch (err) {
    clearTimeout(tid)
    if (err.name === 'AbortError') return { ok: false, error: 'timeout' }
    return { ok: false, error: err.message || 'unknown' }
  }
})

// ── IPC: Deep Simulation per-run storage (Phase 3.5) ─────────────────────────
// Storage location: <userData>/projects/<projectId>/deep-sims/<simId>.json
// Rationale: nests under the existing per-project subdir (same place library
// files live). Each simulation result is its own file so the project JSON
// stays small — heavy data (full agent Knowledge, event log, butterfly trace)
// only loads when the writer opens that simulation's result panel.
const getDeepSimDir = (projectId) => {
  const dir = path.join(projectsDir, projectId, 'deep-sims')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

ipcMain.handle('save-deep-sim-result', (_, { projectId, simId, fullResult }) => {
  try {
    const dir = getDeepSimDir(projectId)
    const filePath = path.join(dir, `${simId}.json`)
    fs.writeFileSync(filePath, JSON.stringify(fullResult, null, 2), 'utf8')
    const stats = fs.statSync(filePath)
    return { ok: true, path: filePath, size: stats.size }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('load-deep-sim-result', (_, { projectId, simId }) => {
  try {
    const filePath = path.join(projectsDir, projectId, 'deep-sims', `${simId}.json`)
    if (!fs.existsSync(filePath)) return { ok: false, error: 'not_found' }
    return { ok: true, fullResult: JSON.parse(fs.readFileSync(filePath, 'utf8')) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('list-deep-sim-results', (_, projectId) => {
  try {
    const dir = path.join(projectsDir, projectId, 'deep-sims')
    if (!fs.existsSync(dir)) return { ok: true, files: [] }
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stats = fs.statSync(path.join(dir, f))
        return { simId: f.replace(/\.json$/, ''), size: stats.size, mtime: stats.mtime.toISOString() }
      })
    return { ok: true, files }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('delete-deep-sim-result', (_, { projectId, simId }) => {
  try {
    const filePath = path.join(projectsDir, projectId, 'deep-sims', `${simId}.json`)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ── IPC: Project File Library ────────────────────────────────────────────────
const getLibraryDir = (projectId) => {
  const dir = path.join(projectsDir, projectId, 'library')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

const getLibraryMeta = (projectId) => {
  const metaPath = path.join(projectsDir, projectId, 'library-meta.json')
  if (!fs.existsSync(metaPath)) return []
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch { return [] }
}

const saveLibraryMeta = (projectId, meta) => {
  const dir = path.join(projectsDir, projectId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'library-meta.json'), JSON.stringify(meta, null, 2))
}

ipcMain.handle('library-add-files', async (_, projectId) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Files to Library',
    properties: ['openFile', 'multiSelections'],
  })
  if (canceled || filePaths.length === 0) return []
  const libDir = getLibraryDir(projectId)
  const meta = getLibraryMeta(projectId)
  const added = []
  for (const fp of filePaths) {
    const name = path.basename(fp)
    const stats = fs.statSync(fp)
    const ext = path.extname(fp).toLowerCase().slice(1)
    // Copy file into library dir (avoid overwrite by appending timestamp if exists)
    let destName = name
    if (fs.existsSync(path.join(libDir, name))) {
      const base = path.basename(name, path.extname(name))
      destName = `${base}_${Date.now()}${path.extname(name)}`
    }
    fs.copyFileSync(fp, path.join(libDir, destName))
    const entry = { filename: destName, originalName: name, size: stats.size, type: ext, dateAdded: new Date().toISOString(), tags: [], starred: false }
    meta.push(entry)
    added.push(entry)
  }
  saveLibraryMeta(projectId, meta)
  return added
})

ipcMain.handle('library-list-files', async (_, projectId) => {
  return getLibraryMeta(projectId)
})

ipcMain.handle('library-delete-file', async (_, { projectId, filename }) => {
  try {
    const libDir = getLibraryDir(projectId)
    const filePath = path.join(libDir, filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    let meta = getLibraryMeta(projectId)
    meta = meta.filter(m => m.filename !== filename)
    saveLibraryMeta(projectId, meta)
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('library-open-file', async (_, { projectId, filename }) => {
  const libDir = getLibraryDir(projectId)
  const filePath = path.join(libDir, filename)
  if (fs.existsSync(filePath)) shell.openPath(filePath)
  return { ok: true }
})

ipcMain.handle('library-export-file', async (_, { projectId, filename }) => {
  const libDir = getLibraryDir(projectId)
  const srcPath = path.join(libDir, filename)
  if (!fs.existsSync(srcPath)) return { ok: false, error: 'File not found' }
  const { canceled, filePath: destPath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export File',
    defaultPath: filename,
  })
  if (canceled || !destPath) return { ok: false, error: 'Cancelled' }
  fs.copyFileSync(srcPath, destPath)
  return { ok: true }
})

ipcMain.handle('library-update-meta', async (_, { projectId, filename, updates }) => {
  let meta = getLibraryMeta(projectId)
  meta = meta.map(m => m.filename === filename ? { ...m, ...updates } : m)
  saveLibraryMeta(projectId, meta)
  return { ok: true }
})

ipcMain.handle('library-save-blob', async (_, { projectId, filename, dataBase64 }) => {
  const libDir = getLibraryDir(projectId)
  fs.writeFileSync(path.join(libDir, filename), Buffer.from(dataBase64, 'base64'))
  let meta = getLibraryMeta(projectId)
  const stats = fs.statSync(path.join(libDir, filename))
  const ext = path.extname(filename).toLowerCase().slice(1)
  if (!meta.find(m => m.filename === filename)) {
    meta.push({ filename, originalName: filename, size: stats.size, type: ext, dateAdded: new Date().toISOString(), tags: [], starred: false })
    saveLibraryMeta(projectId, meta)
  }
  return { ok: true }
})

// Read a specific library file's text content
ipcMain.handle('library-read-file', async (_, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.txt' || ext === '.md') {
      return { content: fs.readFileSync(filePath, 'utf8') }
    }
    if (ext === '.docx') {
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ path: filePath })
      return { content: result.value }
    }
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse')
      const buffer = fs.readFileSync(filePath)
      const data = await pdfParse(buffer)
      return { content: data.text }
    }
    return { error: 'Unsupported file type: ' + ext }
  } catch (err) { return { error: err.message } }
})

// Save file with native dialog
ipcMain.handle('save-file-dialog', async (_, { defaultName, dataBase64, filters }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save File',
    defaultPath: defaultName,
    filters: filters || [],
  })
  if (canceled || !filePath) return { ok: false }
  fs.writeFileSync(filePath, Buffer.from(dataBase64, 'base64'))
  return { ok: true, path: filePath }
})
