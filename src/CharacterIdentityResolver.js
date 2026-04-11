/**
 * CharacterIdentityResolver
 *
 * Runs AFTER the CharacterStoryAnalyser. Identifies POTENTIAL duplicate
 * characters and presents evidence to the writer for their decision.
 *
 * NEVER automatically merges anything. The writer always has the final say.
 */

import { callClaude } from './api.js';

/**
 * Calculate Levenshtein edit distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Strip common title prefixes and parenthetical qualifiers to get a core name.
 */
const TITLE_PREFIXES = /^(lord|lady|sir|the|old|young|evil|great|dark|elder|king|queen|prince|princess|master|grand|captain|commander)\s+/i;

function coreName(name) {
  // Strip parenthetical qualifiers: "Split-Eye (Camm Lizardine)" → "Split-Eye"
  let core = name.replace(/\s*\(.*?\)\s*/g, '').trim();
  // Strip title prefixes
  core = core.replace(TITLE_PREFIXES, '').trim();
  // If stripping removed everything, use original
  return core || name.trim();
}

/**
 * @typedef {Object} PotentialMatch
 * @property {object} characterA - full profile of first character
 * @property {object} characterB - full profile of second character
 * @property {string} detectionMethod - how it was found
 * @property {string} confidence - certain/high/medium/low
 * @property {string} evidence - specific reasons why they might be the same
 * @property {string} storyContext - relevant references
 * @property {string} nameA - display name for character A
 * @property {string} nameB - display name for character B
 */

/**
 * Resolve potential character identity matches.
 *
 * @param {Array} newProfiles - CharacterProfile objects from the analyser
 * @param {Array} existingChars - current chars in the Story Bible
 * @param {Array<{name:string, content:string}>} files - original files for context
 * @param {string} pastedContent - optional pasted text
 * @returns {Promise<{matches: PotentialMatch[], newCharacters: Array, updates: Array}>}
 */
export async function resolveIdentities(newProfiles, existingChars = [], files = [], pastedContent = '') {
  const matches = [];
  const seen = new Set(); // track pairs to avoid duplicates

  const pairKey = (a, b) => [a, b].sort().join('|||');

  // Build a combined pool: existing chars + new profiles
  const existingNormalized = (existingChars || []).map(c => ({
    ...c,
    _source: 'existing',
    _coreName: coreName(c.name || ''),
    _allNames: [c.name, ...(c.aliases || [])].filter(Boolean),
  }));

  const newNormalized = (newProfiles || []).map(p => ({
    ...p,
    _source: 'new',
    name: p.primaryName,
    _coreName: coreName(p.primaryName || ''),
    _allNames: [p.primaryName, ...(p.aliases || [])].filter(Boolean),
  }));

  // We compare: new vs existing, AND new vs new (in case the analyser already split them)
  const allEntries = [...existingNormalized, ...newNormalized];

  for (let i = 0; i < allEntries.length; i++) {
    for (let j = i + 1; j < allEntries.length; j++) {
      const a = allEntries[i];
      const b = allEntries[j];
      const key = pairKey(a.id || a.name, b.id || b.name);
      if (seen.has(key)) continue;

      // Test all name combinations
      const aNamesLower = a._allNames.map(n => n.toLowerCase());
      const bNamesLower = b._allNames.map(n => n.toLowerCase());
      const aCores = a._allNames.map(n => coreName(n).toLowerCase());
      const bCores = b._allNames.map(n => coreName(n).toLowerCase());

      let matched = false;

      // METHOD A: Exact name match
      for (const an of aNamesLower) {
        for (const bn of bNamesLower) {
          if (an === bn && an.length > 0) {
            seen.add(key);
            matches.push({
              characterA: a,
              characterB: b,
              detectionMethod: 'exact_name_match',
              confidence: 'certain',
              evidence: `Both share the exact name "${an}"`,
              storyContext: buildStoryContext(a, b),
              nameA: a.name || a.primaryName,
              nameB: b.name || b.primaryName,
            });
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      if (matched) continue;

      // METHOD B: Name with qualifier — core name matches
      for (const ac of aCores) {
        for (const bc of bCores) {
          if (ac === bc && ac.length >= 3) {
            // Core names match after stripping titles/qualifiers
            const aFull = a.name || a.primaryName;
            const bFull = b.name || b.primaryName;
            if (aFull.toLowerCase() !== bFull.toLowerCase()) {
              seen.add(key);
              matches.push({
                characterA: a,
                characterB: b,
                detectionMethod: 'name_with_qualifier',
                confidence: 'high',
                evidence: `Core name "${ac}" matches after stripping titles/qualifiers. Full names: "${aFull}" vs "${bFull}"`,
                storyContext: buildStoryContext(a, b),
                nameA: aFull,
                nameB: bFull,
              });
              matched = true;
              break;
            }
          }
        }
        if (matched) break;
      }
      if (matched) continue;

      // METHOD C: Substring match (one name contained in other)
      for (const an of aNamesLower) {
        for (const bn of bNamesLower) {
          if (an.length >= 4 && bn.length >= 4) {
            if ((bn.includes(an) || an.includes(bn)) && an !== bn) {
              const shorter = an.length <= bn.length ? an : bn;
              if (shorter.length >= 4) {
                seen.add(key);
                matches.push({
                  characterA: a,
                  characterB: b,
                  detectionMethod: 'substring_match',
                  confidence: 'medium',
                  evidence: `"${shorter}" is contained within the other name. "${a.name || a.primaryName}" vs "${b.name || b.primaryName}"`,
                  storyContext: buildStoryContext(a, b),
                  nameA: a.name || a.primaryName,
                  nameB: b.name || b.primaryName,
                });
                matched = true;
                break;
              }
            }
          }
        }
        if (matched) break;
      }
      if (matched) continue;

      // METHOD D: Spelling variation (Levenshtein distance)
      for (const ac of aCores) {
        for (const bc of bCores) {
          if (ac.length >= 4 && bc.length >= 4) {
            const dist = levenshtein(ac, bc);
            if (dist > 0 && dist <= 2) {
              seen.add(key);
              matches.push({
                characterA: a,
                characterB: b,
                detectionMethod: 'spelling_variation',
                confidence: 'medium',
                evidence: `"${ac}" and "${bc}" have edit distance of ${dist} — possible typo or alternate spelling`,
                storyContext: buildStoryContext(a, b),
                nameA: a.name || a.primaryName,
                nameB: b.name || b.primaryName,
              });
              matched = true;
              break;
            }
          }
        }
        if (matched) break;
      }
    }
  }

  // METHOD E: AI-powered descriptor and alias matching for remaining unmatched
  // Collect characters that weren't matched by methods A-D
  const matchedIds = new Set();
  for (const m of matches) {
    matchedIds.add(m.characterA.id || m.characterA.name);
    matchedIds.add(m.characterB.id || m.characterB.name);
  }

  const unmatched = allEntries.filter(e => !matchedIds.has(e.id || e.name));

  if (unmatched.length >= 2) {
    try {
      const aiMatches = await aiDescriptorMatch(unmatched, files, pastedContent);
      for (const aim of aiMatches) {
        const key = pairKey(aim.nameA, aim.nameB);
        if (!seen.has(key)) {
          seen.add(key);
          const charA = allEntries.find(e => (e.name || e.primaryName) === aim.nameA);
          const charB = allEntries.find(e => (e.name || e.primaryName) === aim.nameB);
          if (charA && charB) {
            matches.push({
              characterA: charA,
              characterB: charB,
              detectionMethod: 'ai_descriptor_match',
              confidence: aim.confidence || 'low',
              evidence: aim.reasoning || 'AI-detected potential match based on story context',
              storyContext: aim.storyContext || '',
              nameA: aim.nameA,
              nameB: aim.nameB,
            });
          }
        }
      }
    } catch (e) {
      console.warn('AI descriptor matching failed (non-fatal):', e.message);
    }
  }

  // Categorize new profiles: matches vs genuinely new vs updates to existing
  const matchedNewIds = new Set();
  const matchedExistingIds = new Set();
  for (const m of matches) {
    if (m.characterA._source === 'new') matchedNewIds.add(m.characterA.id);
    if (m.characterB._source === 'new') matchedNewIds.add(m.characterB.id);
    if (m.characterA._source === 'existing') matchedExistingIds.add(m.characterA.id);
    if (m.characterB._source === 'existing') matchedExistingIds.add(m.characterB.id);
  }

  const newCharacters = newNormalized.filter(p => !matchedNewIds.has(p.id));

  // For characters that matched an existing one with confidence "certain",
  // check if the new profile has data the existing one doesn't
  const updates = [];
  for (const m of matches) {
    if (m.confidence === 'certain' || m.detectionMethod === 'exact_name_match') {
      const existing = m.characterA._source === 'existing' ? m.characterA : m.characterB._source === 'existing' ? m.characterB : null;
      const newProf = m.characterA._source === 'new' ? m.characterA : m.characterB._source === 'new' ? m.characterB : null;
      if (existing && newProf) {
        const newInfo = [];
        if (newProf.species && !existing.species) newInfo.push({ field: 'species', value: newProf.species });
        if (newProf.secrets && !existing.secrets) newInfo.push({ field: 'secrets', value: newProf.secrets });
        if (newProf.stakes && !existing.stakes) newInfo.push({ field: 'stakes', value: newProf.stakes });
        if (newProf.contradictions && !existing.contradictions) newInfo.push({ field: 'contradictions', value: newProf.contradictions });
        if (newProf.arc && !existing.arc) newInfo.push({ field: 'arc', value: newProf.arc });
        if (newProf.established && !existing.established) newInfo.push({ field: 'established', value: newProf.established });
        if (newProf.abilities && !existing.abilities) newInfo.push({ field: 'abilities', value: newProf.abilities });
        if (newInfo.length > 0) {
          updates.push({
            existingChar: existing,
            newProfile: newProf,
            newFields: newInfo,
          });
        }
      }
    }
  }

  // Sort matches by confidence
  const confidenceOrder = { certain: 0, high: 1, medium: 2, low: 3 };
  matches.sort((a, b) => (confidenceOrder[a.confidence] || 4) - (confidenceOrder[b.confidence] || 4));

  return { matches, newCharacters, updates };
}

/**
 * Build a story context string from two character profiles.
 */
function buildStoryContext(a, b) {
  const parts = [];
  const aApps = a.appearances || [];
  const bApps = b.appearances || [];

  if (aApps.length > 0) {
    parts.push(`"${a.name || a.primaryName}" appears in: ${aApps.map(ap => ap.file).join(', ')}`);
  }
  if (bApps.length > 0) {
    parts.push(`"${b.name || b.primaryName}" appears in: ${bApps.map(ap => ap.file).join(', ')}`);
  }

  // Show roles if available
  if (a.role) parts.push(`${a.name || a.primaryName}'s role: ${a.role}`);
  if (b.role) parts.push(`${b.name || b.primaryName}'s role: ${b.role}`);

  return parts.join('\n');
}

/**
 * Use Claude to find descriptor/alias matches that rule-based methods missed.
 */
async function aiDescriptorMatch(unmatchedChars, files, pastedContent) {
  const charList = unmatchedChars.map(c => ({
    name: c.name || c.primaryName,
    aliases: c._allNames || [c.name || c.primaryName],
    role: c.role || '',
    species: c.species || '',
    source: c._source,
  }));

  // Build a condensed version of the story for context
  let storyContext = '';
  if (files && files.length > 0) {
    storyContext = files.map(f => `=== ${f.name} ===\n${f.content.slice(0, 8000)}`).join('\n\n');
  }
  if (pastedContent) {
    storyContext += '\n\n=== Pasted content ===\n' + pastedContent.slice(0, 8000);
  }

  const data = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: `You are a character identity analyst. Given a list of characters from a story and the story content, determine which characters might refer to the same person based on context, descriptions, roles, relationships, and narrative logic.

IMPORTANT: In some stories, two different characters intentionally share a name or descriptor. Do not assume a match — only flag genuine possibilities with evidence.

Respond ONLY with valid JSON:
{
  "matches": [
    {
      "nameA": "character name",
      "nameB": "character name",
      "confidence": "high|medium|low",
      "reasoning": "specific evidence from the story",
      "storyContext": "relevant quote or reference"
    }
  ]
}

If no matches are found, return {"matches": []}`,
    messages: [{
      role: 'user',
      content: `Characters to check:\n${JSON.stringify(charList, null, 2)}\n\nStory content:\n${storyContext.slice(0, 30000)}`
    }]
  });

  const text = data.content?.[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    return parsed.matches || [];
  } catch {
    return [];
  }
}

/**
 * Merge two character profiles, keeping the richer combined version.
 * Used after writer confirms SAME CHARACTER.
 *
 * @param {object} a - first profile
 * @param {object} b - second profile
 * @param {string} chosenName - writer's chosen canonical name
 * @returns {object} merged profile
 */
export function mergeProfiles(a, b, chosenName) {
  const merge = (va, vb) => {
    if (!va && !vb) return '';
    if (!va) return vb;
    if (!vb) return va;
    if (va === vb) return va;
    return va + '\n---\n' + vb;
  };

  const mergeArrays = (aa, ab) => {
    const combined = [...(aa || []), ...(ab || [])];
    // Deduplicate by string value for simple arrays
    if (combined.length > 0 && typeof combined[0] === 'string') {
      return [...new Set(combined)];
    }
    return combined;
  };

  // Collect all aliases from both
  const allAliases = new Set();
  [a.name, a.primaryName, b.name, b.primaryName, ...(a.aliases || []), ...(b.aliases || [])].forEach(n => {
    if (n) allAliases.add(n);
  });
  allAliases.delete(chosenName); // primary name shouldn't be in aliases list

  return {
    id: a.id || b.id || 'cp_' + Math.random().toString(36).slice(2, 8),
    name: chosenName,
    primaryName: chosenName,
    aliases: [...allAliases],
    role: merge(a.role, b.role),
    species: a.species || b.species || '',
    abilities: merge(a.abilities, b.abilities),
    physicalDescription: merge(a.physicalDescription, b.physicalDescription),
    traits: merge(a.traits, b.traits),
    relationships: mergeArrays(a.relationships, b.relationships),
    secrets: merge(a.secrets, b.secrets),
    stakes: merge(a.stakes, b.stakes),
    contradictions: merge(a.contradictions, b.contradictions),
    appearances: mergeArrays(a.appearances, b.appearances),
    keyScenes: mergeArrays(a.keyScenes, b.keyScenes),
    foreshadowing: merge(a.foreshadowing, b.foreshadowing),
    arc: merge(a.arc, b.arc),
    established: merge(a.established, b.established),
  };
}
