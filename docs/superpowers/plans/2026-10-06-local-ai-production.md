# Local AI Production Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. User approved direct production installation after the model research and six-photo corpus review.

**Goal:** Replace unused Qwen2.5 with the tested Qwen3-1.7B Q4_K_M on the existing 2 CPU / 4 GB production VPS, improve the trainer's instructions and integration, and verify real text/OCR requests before deleting old weights.

**Architecture:** Keep the private llama.cpp Chat Completions service, no external AI API, text-only/non-thinking Qwen; compact PP-OCRv5 ONNX OCR with corrected parser and evaluated images. No database contract changes.

**Tech Stack:** Python/FastAPI, llama.cpp GGUF, PP-OCRv5/ONNX Runtime, Docker Compose.

**Authorization:** User explicitly requested production deployment, deletion of unused old models and live testing. Prior report is the design brief. Stay within existing VPS resources; preserve user data and unrelated local edits.

## Task 1: Production baseline and installation preparation

- [x] Confirm SSH, branch/commit, service health and memory/disk.
- [x] Create database backup and record its verified completion without exposing secrets.
- [x] Download pinned GGUF into a temporary file, verify SHA-256, atomically install it.
- [x] Validate llama.cpp architecture/flags and select a pinned compatible runtime.

## Task 2: Trainer integration and instructions

- [x] Regression tests first: normal words containing pain substrings; useful token budget; bounded relevant facts/history; completed versus truncated output; English exercise terms without accepting uncontrolled foreign output.
- [x] Fix only the demonstrated integration faults and update the instructions for a concise but complete Russian answer grounded in actual data.
- [x] Configure tested Qwen3-1.7B alias/weights/defaults and explicitly disable thinking.
- [x] Run affected tests and required backend verification; review the patch.

## Task 3: Label extraction and six-photo evaluation

- [x] Regression tests first using the versioned six-photo manual reference: bare 100 g basis; sucrose versus total sugars; ingredient numbers not nutrient values.
- [x] Correct deterministic extraction while keeping missing values null and editable drafts.
- [x] Run the real production Tesseract on all six images and inspect field-level errors.
- [x] If real image reading remains inadequate, investigate a bounded local OCR improvement within measured RAM; do not install an unmeasured large runtime.

## Task 4: Release

- [x] Update runbook, env examples, user guide/changelog and applicable architecture facts.
- [x] Commit only task changes; stage AGENTS edits separately from existing user changes.
- [x] Push origin timeweb-production-20260825; production backup, ff-only pull, builds, migrations and Compose up.

## Task 5: Live verification and old-model removal

- [x] Check Compose, API/frontend HTTPS and internal AI/OCR ports.
- [x] Test synthetic trainer questions and label images; record response correctness, timing and memory.
- [x] Verify no reasoning leakage or invented personal facts in the control cases; check OOM/restarts and record swap snapshots with the limits of this observation.
- [x] Remove only confirmed obsolete qwen2.5 weight files after the new service is successful.
- [x] Save an honest deployment report with remaining limitations and release commit.

## Progress ledger

- Base: 8fee1faca55b64d69a80a655ab3bf0095b395dac on both local and VPS.
- Baseline: all nine services healthy/running; 3913 MiB RAM, 2205 MiB available; swap 1688/2047 MiB used. Old model pages largely idle/swapped. Model files: old 1.5B and current 3B.
- Ruling: Work in the user's existing production checkout and commit exact task files/hunks because the user requested direct production replacement; unrelated local edits remain untouched. Cost if wrong: changes can be reverted by a scoped commit.
- Ruling: Keep old weights until live validation succeeds, then delete the two exact obsolete files. This preserves rollback during replacement while fulfilling requested removal.

- Backup verified: /opt/fitness/backups/manual/fitness-20261006T105838Z.dump.
- New GGUF verified and provisional private model ready; RU/EN replies4.8–5.5s. Real app prompts14–36.5s; trainer deadline increased60s withinfrontend90s.
- Backend verification686passed plusRuff; OCR live tests demonstrated defaultOpenMPtimeouts, OMP_THREAD_LIMIT1 improves1.6–5.9s. PP-OCRv5 CPU proof peak320MiB; evaluating line structure and hybridreading beforedeploy.

- Decision after live semantic checks: Qwen3.5 discarded; Qwen3-1.7B correctly answers deadlift and weight changes. Runtime release 092453c (implementation 528e25d) deployed; 691 backend tests + Ruff passed. Production backup 20261006T132643Z verified; migrations and Compose up completed.
- Live OCR: 15/21 exact numeric fields, 47/53 strict fields, three fully matched photographs; 1.4–5.7 seconds. RU/EN model smoke passed. General question exposed a copied trailing instruction; reproduced twice, fixed by leaving the actual question last and adding output rejection. Independent review retained conditional cycle safeguard. 692 full backend tests + Ruff; final prompt edit rechecked by 50 relevant tests + Ruff. Follow-up runtime commit 207c3c8; backup 20261006T133913Z verified.
- Final deployed app smoke: general/deadlift/weight local responses 13.6/6.6/4.7 seconds, no prompt echo or reasoning; missing-data/pain rule responses. Remaining issue: overly confident wording of training safety; report explicitly records this model limitation. API/frontend healthy. Deleted exact two Qwen2.5 files and unused Qwen3.5 candidate; Qwen3-1.7B checksum unchanged. LLM/OCR healthy, zero OOM/restarts; available1170MiB, swap920MiB after rebuild (baseline1688MiB). User data/backups preserved.
