// Unified API abstraction
// In Electron: routes through IPC to main process (API key never touches renderer)
// In browser: routes through local Express proxy (npm run dev)

export const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI

export async function callClaude(payload) {
  if (isElectron()) {
    const data = await window.electronAPI.callClaude(payload)
    if (data?.error === 'no_key') {
      throw new Error('API_KEY_MISSING')
    }
    if (data?.error === 'network') {
      throw new Error(data.message || 'Network error')
    }
    if (data?.error === 'timeout') {
      throw new Error(data.message || 'Claude API timeout after 60s')
    }
    if (data?.error === 'api') {
      throw new Error(data.message || `API error (${data.status})`)
    }
    return data
  }

  // Browser / Vite dev server fallback
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `API returned ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data
}
