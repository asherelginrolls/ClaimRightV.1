# QUARANTINE — DO NOT INGEST

The files in this folder are **synthetic** and violate the core trust guarantee
(CLAUDE.md §1: no fabricated case IDs, ever).

## ombudsman-awards-precedents.{md,json}

These three "ombudsman awards" were synthesized, not downloaded:

- The case numbers (IOB/MUM/2022/HI/00147, IOB/DEL/2023/HI/00089,
  IOB/BLR/2023/HI/00312) do not correspond to real published awards.
- All three awards are dated 2022–2023 but cite the IRDAI Master Circular of
  **29.05.2024** or the PPOI Master Circular of **05.09.2024** — regulations that
  did not exist yet. Impossible on their face.

They were ingested into `kb_chunks` on 2026-05-24 as `IOB-AWARDS-2023` (3 chunks,
source_title "Insurance Ombudsman Award Precedents").
`scripts/purge-synthetic-precedents.ts` removes them from any database that still
contains them.

**Never move these files back. Never ingest anything from this folder.**
Real awards must be downloaded and verified from cioins.co.in/Decisions; until a
precedent is verified, precedent-style content ships with NO case-number
attribution and is labeled a general principle.
