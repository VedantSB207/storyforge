// Phase 5 — visualization helpers shared across MapView, BondNetwork,
// ButterflyTraceView, CharacterThreads.

import { C } from '../../constants.js'

// Stable per-character color palette. Cycles through a curated set so the
// same bound char gets the same color in every panel.
const BOUND_COLORS = [
  '#e8c07d', // gold
  '#9b59b6', // purple
  '#3498db', // blue
  '#1abc9c', // teal
  '#e74c3c', // red
  '#2ecc71', // green
  '#f39c12', // orange
  '#e91e63', // pink
  '#00bcd4', // cyan
  '#8e44ad', // deep purple
  '#27ae60', // dark green
  '#d35400', // burnt orange
]

const boundColorCache = new Map()
function colorForBound(agentId) {
  if (boundColorCache.has(agentId)) return boundColorCache.get(agentId)
  const idx = boundColorCache.size % BOUND_COLORS.length
  const color = BOUND_COLORS[idx]
  boundColorCache.set(agentId, color)
  return color
}

// Genre colors for procedural NPCs
const GENRE_COLORS = {
  animal_kingdom:     '#8d6e63',   // brown
  supernatural:       '#9c27b0',   // purple
  mythology:          '#5e35b1',   // deep purple
  humans:             '#1e88e5',   // blue
  spirits:            '#7e57c2',   // muted purple
  mechanical:         '#607d8b',   // blue-gray
  undead:             '#37474f',   // dark gray
  mythological_beings:'#5e35b1',
}

export function getAgentColor(agent) {
  if (!agent) return C.muted
  if (agent.source === 'bound') return colorForBound(agent.id)
  const genrePrefix = (agent.genreTag || '').split(':')[0]
  return GENRE_COLORS[genrePrefix] || '#78909c'
}

export function getGenreColor(genrePrefix) {
  return GENRE_COLORS[genrePrefix] || '#78909c'
}

// Event category color palette
const EVENT_COLORS = {
  death:         '#c62828',   // dark red
  betrayal:      '#7b1f1f',   // deeper red
  conflict:      '#ef6c00',   // orange
  cooperation:   '#43a047',   // green
  travel:        '#1e88e5',   // blue
  rest:          '#90a4ae',   // muted blue-gray
  eat:           '#a1887f',   // muted brown
  observe:       '#9575cd',   // soft purple
  need_critical: '#fb8c00',   // amber
  aging:         '#bdbdbd',   // light gray
  promotion:     '#ffd54f',   // yellow (bond promotion)
  rumour:        '#78909c',
  witnessed:     '#26c6da',
  dialogue:      '#ce93d8',
  bond_promoted: '#ffd54f',
}

export function getEventColor(category) {
  return EVENT_COLORS[category] || '#9e9e9e'
}

// Bond type color palette
const BOND_TYPE_COLORS = {
  friendship: '#43a047',   // green
  love:       '#e91e63',   // red/pink
  kinship:    '#8e24aa',   // purple
  rivalry:    '#ef6c00',   // orange
  enmity:     '#7b1f1f',   // dark red
  weak:       '#bdbdbd',   // light gray
}

export function getBondTypeColor(type) {
  return BOND_TYPE_COLORS[type] || '#bdbdbd'
}

// "Year 12" / "Month 4" / "Day 17" — used by time slider labels
export function formatRoundLabel(round, timeUnit) {
  const unitNames = {
    hour: 'Hour', day: 'Day', week: 'Week', month: 'Month', season: 'Season', year: 'Year',
  }
  return `${unitNames[timeUnit] || 'Round'} ${round}`
}

// Map region name → fixed 2D position for MapView. Six default regions on
// a star around `central`. Wilderness sits on a perimeter ring.
export const REGION_POSITIONS = {
  central:    { x: 400, y: 300 },
  north:      { x: 400, y: 100 },
  south:      { x: 400, y: 500 },
  east:       { x: 650, y: 300 },
  west:       { x: 150, y: 300 },
  wilderness: { x: 700, y: 480 },
}

export const REGION_RADIUS = 95

export function regionCenter(region) {
  return REGION_POSITIONS[region] || REGION_POSITIONS.central
}

// Deterministic jitter within a region for an agent — keeps the same agent
// in roughly the same on-screen position across renders, while distributing
// agents within the region.
export function agentPositionInRegion(agent, occupants = []) {
  const center = regionCenter(agent.region)
  // FNV-1a hash of agent.id for deterministic jitter
  let h = 0x811c9dc5
  const s = String(agent.id || '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  const angle  = (h % 360) * (Math.PI / 180)
  const radius = ((h >> 8) % 70) + 10
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  }
}
