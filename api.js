// Unified API abstraction
// In Electron: routes through IPC to main process (API key never touches renderer)
// In browser: routes through local Express proxy (npm run dev)

export const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI

export async function callClaude(payload) {
  if (isElectron()) {
    const data = await window.electronAPI.callClaude(payload)
    // Surface API key errors clearly
    if (data?.error === 'no_key') {
      throw new Error('API_KEY_MISSING')
    }
    return data
  }

  // Browser / Vite dev server fallback
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
}
