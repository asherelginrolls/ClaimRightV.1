-- Phase 4: kb_chunks.authority_type ∈ {definition, regulation, precedent}.
-- Backfill: standardized-exclusion definition chunks → 'definition';
-- Tier-2 (real awards, when ingested) → 'precedent'; everything else Tier-1
-- regulatory text → 'regulation'.

ALTER TABLE kb_chunks
  ADD COLUMN IF NOT EXISTS authority_type TEXT
  CHECK (authority_type IN ('definition', 'regulation', 'precedent'));

UPDATE kb_chunks
SET authority_type = CASE
  WHEN tier = 2 THEN 'precedent'
  WHEN source_title ILIKE '%exclusion%' OR section_number ILIKE '%excl%' THEN 'definition'
  ELSE 'regulation'
END
WHERE authority_type IS NULL;
