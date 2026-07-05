// Pure synonym expansion for Indian insurance terminology.
// No imports — safe to use from both lib/ and scripts/ without pulling
// in path-aliased modules.
//
// Appends synonym expansions to a query string so voyage-law-2 embeddings
// capture terminology variants not present in KB chunk text.
// Used by lib/retrieval.ts (production path) and scripts/diagnose-retrieval.ts.

const SYNONYM_MAP: Array<[RegExp, string]> = [
  // TPA abbreviation
  [/\bTPA\b/gi, 'third party administrator TPA'],
  // Cashless pre-auth variants
  [/\bpre-auth\b/gi, 'pre-authorization cashless authorization'],
  [/\bpreauth\b/gi, 'pre-authorization cashless authorization'],
  // Repudiation / rejection synonyms
  [/\brepudiat(ion|ed|e)\b/gi, 'rejection denial refused repudiation'],
  // Non-disclosure synonyms
  [/\bsuppression\b/gi, 'non-disclosure concealment suppression'],
  [/\bmisrepresentation\b/gi, 'non-disclosure false information misrepresentation'],
  // GRO expansion
  [/\bGRO\b/g, 'Grievance Redressal Officer GRO internal complaints grievance'],
  // IGMS / Bima Bharosa
  [/\bIGMS\b/g, 'Bima Bharosa IRDAI integrated grievance portal IGMS'],
  [/\bBima Bharosa\b/gi, 'IGMS IRDAI integrated grievance management portal Bima Bharosa'],
  // Moratorium / waiting period cross-reference
  [/\bmoratorium\b/gi, 'moratorium waiting period exclusion period pre-existing disease'],
  [/\bwaiting period\b/gi, 'waiting period moratorium exclusion initial waiting pre-existing'],
  // Experimental treatment synonyms
  [/\bexperimental treatment\b/gi, 'experimental unproven investigational non-standard treatment advanced procedure'],
  [/\binvestigational\b/gi, 'experimental unproven non-standard investigational'],
  // Ombudsman / CIO
  [/\bombudsman\b/gi, 'ombudsman Insurance Ombudsman CIO grievance adjudication award'],
  // Consumer court
  [/\bconsumer court\b/gi, 'consumer court NCDRC SCDRC district forum deficiency service'],
  // Claim denial synonyms
  [/\bclaim denial\b/gi, 'claim denial repudiation rejection refused settlement'],
  [/\bclaim rejection\b/gi, 'claim rejection repudiation denial refused settlement'],
  // Standardized exclusion codes (Excl01–Excl18, with or without dot/space)
  [/\bExcl\.?\s?0?2\b/gi, 'Excl02 specified disease procedure waiting period listed conditions standardized exclusion'],
  [/\bExcl\.?\s?0?1\b/gi, 'Excl01 pre-existing disease PED waiting period standardized exclusion'],
  [/\bExcl\.?\s?(0?[3-9]|1[0-8])\b/gi, 'standardized exclusion code IRDAI standardization of exclusions'],
  [/\bspecified disease\b/gi, 'specified disease procedure listed conditions Excl02 waiting period'],
  // Documentation / piecemeal
  [/\bpiecemeal\b/gi, 'piecemeal one-go successive repeated document requests want of documents'],
  [/\bincomplete documentation\b/gi, 'want of documents non-submission documents piecemeal rejected closed'],
  // Delay interest
  [/\bdelay(ed)? (interest|settlement)\b/gi, 'penal interest bank rate plus 2 percent suo-moto turnaround time TAT'],
]

export function expandQueryWithSynonyms(query: string): string {
  const appended: string[] = []

  for (const [pattern, expansion] of SYNONYM_MAP) {
    if (pattern.test(query)) {
      appended.push(expansion)
    }
    // Reset lastIndex for global regexes used in test()
    pattern.lastIndex = 0
  }

  if (appended.length === 0) return query
  return `${query} ${appended.join(' ')}`
}
