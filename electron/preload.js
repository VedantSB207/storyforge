const { contextBridge, ipcRenderer } = require('electron')

// Expose a clean, typed API to the renderer (React app)
// Nothing in the renderer can access Node or Electron directly — only these methods
contextBridge.exposeInMainWorld('electronAPI', {

  // ── AI ──────────────────────────────────────────────────────────────────────
  callClaude: (payload) => ipcRenderer.invoke('call-claude', payload),

  // ── File reading ─────────────────────────────────────────────────────────────
  // Opens native macOS file picker, returns extracted text from all selected files
  readFiles: () => ipcRenderer.invoke('read-files'),

  // ── Project persistence ───────────────────────────────────────────────────────
  listProjects: ()           => ipcRenderer.invoke('list-projects'),
  saveProject:  (id, data)   => ipcRenderer.invoke('save-project', { id, data }),
  loadProject:  (id)         => ipcRenderer.invoke('load-project', id),
  deleteProject:(id)         => ipcRenderer.invoke('delete-project', id),

  // ── Settings ──────────────────────────────────────────────────────────────────
  getApiKey: ()    => ipcRenderer.invoke('get-api-key'),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),

  // ── Utilities ─────────────────────────────────────────────────────────────────
  getDataPath: () => ipcRenderer.invoke('get-data-path'),

  // ── Library ──────────────────────────────────────────────────────────────────
  libraryAddFiles:   (projectId)                        => ipcRenderer.invoke('library-add-files', projectId),
  libraryListFiles:  (projectId)                        => ipcRenderer.invoke('library-list-files', projectId),
  libraryDeleteFile: (projectId, filename)              => ipcRenderer.invoke('library-delete-file', { projectId, filename }),
  libraryOpenFile:   (projectId, filename)              => ipcRenderer.invoke('library-open-file', { projectId, filename }),
  libraryExportFile: (projectId, filename)              => ipcRenderer.invoke('library-export-file', { projectId, filename }),
  libraryUpdateMeta: (projectId, filename, updates)     => ipcRenderer.invoke('library-update-meta', { projectId, filename, updates }),
  librarySaveBlob:   (projectId, filename, dataBase64)  => ipcRenderer.invoke('library-save-blob', { projectId, filename, dataBase64 }),
  libraryReadFile:   (filePath)                          => ipcRenderer.invoke('library-read-file', filePath),
  saveFileDialog:    (defaultName, dataBase64, filters)  => ipcRenderer.invoke('save-file-dialog', { defaultName, dataBase64, filters }),

  // ── Deep Simulation per-run storage (Phase 3.5) ──────────────────────────
  saveDeepSimResult:   (projectId, simId, fullResult)    => ipcRenderer.invoke('save-deep-sim-result',   { projectId, simId, fullResult }),
  loadDeepSimResult:   (projectId, simId)                => ipcRenderer.invoke('load-deep-sim-result',   { projectId, simId }),
  listDeepSimResults:  (projectId)                       => ipcRenderer.invoke('list-deep-sim-results',  projectId),
  deleteDeepSimResult: (projectId, simId)                => ipcRenderer.invoke('delete-deep-sim-result', { projectId, simId }),

  // ── Phase 4b/4 — Scenario persistence ────────────────────────────────────
  saveScenarioResult:  (projectId, scenarioId, scenarioRecord) => ipcRenderer.invoke('save-scenario-result',  { projectId, scenarioId, scenarioRecord }),
  loadScenarioResult:  (projectId, scenarioId)                 => ipcRenderer.invoke('load-scenario-result',  { projectId, scenarioId }),
  listScenarioResults: (projectId)                             => ipcRenderer.invoke('list-scenario-results', projectId),

  // ── Ollama (Phase 4a) ────────────────────────────────────────────────────
  queryOllama:        (params)                           => ipcRenderer.invoke('query-ollama', params),

  // Platform flag — lets React know it's running inside Electron
  platform: process.platform,
})
