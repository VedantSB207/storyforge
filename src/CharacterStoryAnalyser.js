/**
 * CharacterStoryAnalyser
 *
 * Runs as part of the Import & Analyse pipeline.
 * For each character found across all uploaded files, extracts a deep profile
 * with full provenance (which file, which alias, which section).
 *
 * Makes ONE Claude API call per batch — not one per character.
 */

import { callClaude } from './api.js';

/**
 * @typedef {Object} CharacterProfile
 * @property {string} id - unique id
 * @property {string} primaryName - best canonical name
 * @property {string[]} aliases - every name/title/nickname/descriptor used
 * @property {string} role - role in the story (may evolve over time)
 * @property {string} species - species/type/nature
 * @property {string} abilities - abilities or powers
 * @property {string} physicalDescription - physical appearance
 * @property {Array<{name:string, relationship:string, implied:boolean}>} relationships
 * @property {string} secrets - what they know that others don't
 * @property {string} stakes - what they stand to lose
 * @property {string} contradictions - contradictions in how they're described
 * @property {Array<{file:string, prominence:string, aliases:string[], context:string}>} appearances
 * @property {string[]} keyScenes - key scenes or events they're involved in
 * @property {string} foreshadowing - foreshadowing or unresolved threads around them
 * @property {string} arc - character arc / transformation
 * @property {string} established - what is definitively established
 */

/**
 * Analyse all uploaded file contents and extract deep character profiles.
 *
 * @param {Array<{name:string, content:string}>} files - uploaded files with extracted text
 * @param {string} pastedContent - optional pasted text content
 * @returns {Promise<{profiles: CharacterProfile[], rawAnalysis: object}>}
 */
export async function analyseCharacters(files, pastedContent = '') {
  // Build content with file boundaries preserved
  let allContent = '';
  if (files && files.length > 0) {
    allContent = files.map(f => `=== FILE: ${f.name} ===\n${f.content}`).join('\n\n');
  }
  if (pastedContent.trim()) {
    allContent += (allContent ? '\n\n=== PASTED CONTENT ===\n' : '') + pastedContent;
  }

  if (!allContent.trim()) {
    return { profiles: [], rawAnalysis: null };
  }

  // Truncate to fit context window while preserving file markers
  const maxChars = 90000;
  const truncated = allContent.length > maxChars
    ? allContent.slice(0, maxChars) + '\n\n[Content truncated at ' + maxChars + ' characters]'
    : allContent;

  const data = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: `You are a master story analyst specialising in character identification and deep profiling. You have been given the full text of one or more files from a writer's story project.

Your job is to identify EVERY character mentioned across all files and build a comprehensive profile for each one. This includes characters who are named, characters referred to by title or descriptor, and characters only implied.

CRITICAL: Track EVERY name, title, nickname, alias, and descriptor used for each character across ALL files. Two different names may refer to the same character (e.g. "Lord Eric Northman" and "Eric Northman", or "Nyra" and "the werewolf cat"). When you believe multiple names refer to the same character, group them together and list all names as aliases. But also note if you're uncertain — some stories intentionally have different characters who share a name.

For each character cluster you identify, extract:
- primaryName: the most commonly used or most complete name
- aliases: EVERY name, title, nickname, descriptor, pronoun-identified reference used (e.g. ["Nyra", "Nyra (Human Assassin)", "Nyra (Werewolf Cat)", "Nyra (Cat)", "the werewolf cat"])
- role: their function at different points in the story (may evolve)
- species: species, type, nature
- abilities: powers, skills, notable capabilities
- physicalDescription: appearance details mentioned
- relationships: array of {name, relationship, implied} — both explicit and implied connections
- secrets: what they know that others don't, or what's hidden about them
- stakes: what they stand to lose
- contradictions: inconsistencies in how they're described across files
- appearances: array of {file, prominence, aliases, context} — which files they appear in, how prominently (major/supporting/mentioned), which aliases are used in each file, and a brief context quote or summary
- keyScenes: scenes or events they're centrally involved in
- foreshadowing: any foreshadowing or unresolved threads connected to them
- arc: the transformation or journey set up for them
- established: what is definitively known vs speculated

Pay special attention to:
1. Characters who appear under DIFFERENT names in different files or sections
2. Characters with titles that may be stripped/added (Lord, Lady, Sir, The, Old, etc.)
3. Characters with parenthetical qualifiers (e.g. "Split-Eye (Camm Lizardine)")
4. Possible spelling variations (e.g. "Garm" vs "Gram")
5. Characters referred to only by descriptor ("the witch", "the assassin")

Respond ONLY with valid JSON. No preamble, no markdown fences. The JSON must have this structure:
{
  "characters": [
    {
      "primaryName": "string",
      "aliases": ["string"],
      "role": "string",
      "species": "string",
      "abilities": "string",
      "physicalDescription": "string",
      "relationships": [{"name": "string", "relationship": "string", "implied": false}],
      "secrets": "string",
      "stakes": "string",
      "contradictions": "string",
      "appearances": [{"file": "string", "prominence": "major|supporting|mentioned", "aliases": ["string"], "context": "string"}],
      "keyScenes": ["string"],
      "foreshadowing": "string",
      "arc": "string",
      "established": "string",
      "uncertainAliases": ["names you think MIGHT belong to this character but aren't sure about"],
      "notes": "any analyst notes about identity ambiguity"
    }
  ],
  "possibleDuplicates": [
    {
      "nameA": "string",
      "nameB": "string",
      "reason": "why these might be the same character",
      "confidence": "high|medium|low"
    }
  ],
  "totalUniqueCharacters": 0,
  "analystNotes": "overall notes about character identification challenges in this material"
}`,
    messages: [{
      role: 'user',
      content: `Analyse ALL characters in the following story content. Track every alias and cross-file appearance:\n\n${truncated}`
    }]
  });

  const text = data.content?.[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    throw new Error('Failed to parse character analysis: ' + e.message);
  }

  // Convert to CharacterProfile objects with IDs
  const profiles = (parsed.characters || []).map((c, i) => ({
    id: 'cp_' + Math.random().toString(36).slice(2, 8),
    primaryName: c.primaryName || c.aliases?.[0] || `Character ${i + 1}`,
    aliases: c.aliases || [c.primaryName],
    role: c.role || '',
    species: c.species || '',
    abilities: c.abilities || '',
    physicalDescription: c.physicalDescription || '',
    relationships: c.relationships || [],
    secrets: c.secrets || '',
    stakes: c.stakes || '',
    contradictions: c.contradictions || '',
    appearances: c.appearances || [],
    keyScenes: c.keyScenes || [],
    foreshadowing: c.foreshadowing || '',
    arc: c.arc || '',
    established: c.established || '',
    uncertainAliases: c.uncertainAliases || [],
    notes: c.notes || '',
  }));

  return {
    profiles,
    rawAnalysis: parsed,
  };
}
