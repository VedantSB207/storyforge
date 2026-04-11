import express from 'express'
import { readFileSync } from 'fs'

// Load .env manually (no dotenv package needed)
try {
  const env = readFileSync('.env', 'utf8')
  env.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  })
} catch { /* .env not found — rely on system env */ }

const app = express()
app.use(express.json({ limit: '10mb' }))

// CORS for Vite dev server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// Proxy endpoint — receives requests from frontend, forwards to Anthropic
app.post('/api/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Anthropic API error:', data)
      return res.status(response.status).json(data)
    }

    res.json(data)
  } catch (err) {
    console.error('Proxy error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.listen(3001, () => {
  console.log('StoryForge API proxy running on http://localhost:3001')
  console.log('API key loaded:', process.env.ANTHROPIC_API_KEY ? '✓' : '✗ MISSING — set in .env')
})
