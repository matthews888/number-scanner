# Flagged Numbers and manual correction

The existing Next.js, React, Tesseract.js and Supabase application now has
Valid Numbers, Flagged Numbers, Needs Review, Reviewed, Landlines and
Screenshots tabs. No missing digits are invented and no extra digits trimmed.
Exact +61 Australian mobile patterns normalise to 04XXXXXXXX. Uncertain
prefixes, OCR characters, incomplete and overlong readings remain reviewable.

## Review workflow

Click a flagged number or missed screenshot to open the retained original.
The viewer includes zoom, mouse drag/touch scroll panning, a coordinate overlay
when OCR supplied a box, an editable field, Save Number, Save & Next,
Previous/Next Number, Skip for Later and Mark as Unreadable. Skips remain
unresolved. Unreadable entries stay in Reviewed with their evidence.

Corrections are validated and saved before UI counts change. The original
OCR text is preserved. Corrected numbers appear immediately in valid CSV.
Normalised duplicates keep their source evidence but export only once.
Existing corrections can be edited by reopening Reviewed. Empty and failed
screenshots have a separate Needs Review queue for manual entry.

## Retained screenshots

IndexedDB stores original image Blobs separately from scan metadata. Uploads
save one original and small thumbnail at a time. Reads of scan lists do not
load full-size image pixels; review loads only the selected original. The
image and its initial metadata commit in one transaction. Storage failure
cannot mark an unretained screenshot as saved. OCR metadata writes never
replace original images. A retry retains previous readings and corrections.

Retained scans can be reopened after refresh/restart using the scan selector.
New scan keeps previous scans. Delete retained scan explicitly removes its
local metadata and originals. Browser persistent storage is requested when
supported, but local browser data can still be cleared or evicted. This is
same-device retention, not cross-device/cloud backup; images are not uploaded.
Old checkpoints created before image retention do not contain originals. The
viewer identifies this and lets the user attach the original file.

Supabase authentication and existing extracted-number history remain. Current
retained scans hold complete review evidence locally. Already saved Supabase
history rows are historical snapshots; manual edits update the retained scan
and its CSV, not old cloud snapshot rows.

## Tests and limits

Run `npm test` and `npm run build`.

- Actual Tesseract OCR on eight generated image fixtures: light/dark, small
  text, mild blur, multiple numbers, dates/names, no number, 7–12 digit rows,
  and repeated digits. The repeated-digit fixture can be fragmented by OCR;
  prefixes are retained as review entries rather than guessed into numbers.
- Validation/model tests cover edits, duplicate corrections, unresolved
  exports, missed screenshots, skip/unreadable states, navigation, failed
  retries and 2,300-entry bookkeeping. This is not a 2,300-image OCR benchmark.
- React DOM integration clicks the actual UI controls through validation
  errors, saving, Save & Next, Previous/Next, duplicates, missed-number entry,
  valid CSV download, reopening retained scans, skip/unreadable, zoom and
  coordinate overlays. Generated PNG originals are stored and checked byte
  for byte after reopening; the test session and OCR review candidates are
  controlled fixtures, not claimed OCR accuracy results.
- IndexedDB tests use fake-indexeddb to verify original retention, saved
  corrections, isolation by user, deletion and atomic storage-failure handling.
- Private sample checks on previously supplied screenshots run outside the
  public repository; private images, manifests and numbers are not committed.

The DOM environment does not render image pixels or measure Safari memory.
Browser binary downloads failed in this environment. Physical iPad/mobile/
desktop rendering, pan gestures, native Photos/Files selection, browser canvas
preprocessing and sustained 2,300-image device performance remain unverified.
The CSS includes mobile and tablet layouts, but no physical-device verification
or perfect OCR accuracy is claimed. OCR confidence is a heuristic, not an
accuracy percentage. High-confidence matching passes can share errors.

## Older cloud history review

Previous scans now makes every number clickable. Review locates same-device
retained evidence by its extraction/correction; an older cloud record with
only numbers and timestamps cannot recover an unsaved original. The viewer
asks the user to attach the actual original before saving. Attachments and
corrections are retained locally, while successful corrections update every
matching cloud history row. Errors are displayed and uncompleted writes can
be retried. History CSVs now contain only normalized, unique valid Australian
mobiles. Four additional history model/UI tests cover validation, duplicate
replacement, CSV filtering, actual viewer navigation, retained-source lookup
and unavailable-source handling. Physical iPad testing remains unverified.

## Simplified main screen

The main results offer Valid Numbers and Missing digits only. The latter
shows unresolved 04-prefixed readings shorter than 10 digits. Other uncertain
OCR evidence, missed images, landlines and reviewed entries stay accessible
under collapsed Other scan results; they are not promoted into valid exports.
Scan selection/deletion and secondary review actions are collapsed. The viewer
renders the stored original Blob without any OCR highlight or tint overlay.
The UI regression checks missing-digit filtering, closed options, absent
highlight elements and byte-for-byte original retention, as well as correction
and export behavior.

## Saved-number selection and bulk deletion

History uses one paginated list with Valid mobiles, Missing digits and Other
numbers. Valid formatting variants share one row. Checkboxes select individual
rows; Select all selects the entire current category across every page.
Delete selected opens a confirmation with the exact unique-row count. Delete
all is under More options. No existing user data was deleted during testing.
Deletion removes every selected occurrence across saved history rows, scopes
writes to the signed-in user, and commits successful rows before proceeding.
A failed write is reported, preserves unrelated numbers and permits retry.
It does not remove locally retained screenshot evidence. History reads are
paginated so cloud rows beyond the first response are included.
Model tests cover normalized duplicate removal, unrelated-number preservation,
partial write failure/retry and 2,300 selected numbers. The real component DOM
test covers 150-row selection across pages, confirmation/cancellation, missing
and other tabs, failure/retry, export and review actions. These use controlled
fixtures, not destructive live account tests. 41 automated tests and the
production build pass; physical iPad rendering remains unverified.

## Delete current dashboard scan

Delete current scan is at the top of the scanner panel, separate from Upload,
Scan and Download. It opens an in-app confirmation with Cancel and Confirm
delete. Confirmation atomically deletes only the current user's selected
local scan metadata and original screenshots, clears review/results/progress,
and opens a fresh scan. Other retained scans and cloud saved history remain.
Deletion is disabled while processing and when the current scan is empty;
errors remain visible in the confirmation for retry. The component test clicks
Cancel without mutation, confirms deletion, checks originals are removed and
older/other-user evidence remains, and checks upload is enabled afterward.
All 41 tests and the production build pass.

## OCR confidence and result visibility correction

Previously, reconciliation incorrectly flagged matching complete numbers when
a later pass had ANY lower confidence, even 97 vs 96. It now retains the lowest
confidence and flags only below the existing 85 threshold; differing digits
still remain reviewable. No missing digits are invented. Regression tests
cover confident agreement, genuinely low-confidence agreement, disagreements,
and actual Tesseract multi-pass recognition on light/dark fixtures.
The two primary result tabs are Valid Numbers and Needs review. Needs review
includes incomplete, complete uncertain and missed screenshots, instead of
hiding complete uncertain readings behind Other scan results. Scan options
has Recheck numbers to rerun retained originals. Fresh valid recognition can
update matching unresolved evidence; manual corrections remain protected.
44 automated tests and the production build pass. The supplied dashboard/CSV
screenshots demonstrate counts only; the completeness of that user's 16-image
batch cannot be verified without its actual source screenshots.

## Remove OCR reading details from the interface

Removed the separate scanned-number readout and diagnostic reason from the shared review editor. The original screenshot and editable number remain. Review lists use a plain verification prompt instead of OCR/confidence diagnostics, while missing/extra-digit reasons remain visible. Scanning and strict validation still run internally; original images are unchanged.

Validation: the DOM integration test passed saving, invalid correction handling, navigation, duplicate detection, export, original byte preservation, restoration and confirmed deletion. Added assertions that the separate readout is absent. Production build passed. No new claim of complete real-world OCR accuracy.

## Format validation without an OCR confidence cutoff

Per the user's revised requirement, complete Australian mobiles are accepted by format regardless of the OCR confidence score. Removed score-based demotion from classification, word parsing and pass reconciliation. Saved confidence-only flags are reclassified on loading IndexedDB, so existing valid numbers become available without re-upload or re-scanning. This does not modify original screenshot blobs or manual corrections. Conflicting digits, ambiguous characters, extra digits and invalid prefixes remain outside valid CSV.

The primary dashboard now has Valid Numbers and Missing digits only. The missing-digit list excludes complete numbers, extra-digit results and missed screenshots; other results remain accessible under the collapsed section.

Validation: 45 tests passed, including genuine multi-pass Tesseract OCR, retained-result migration, missing-only UI filtering, manual correction/navigation, duplicate detection, CSV export and original preservation. Production build passed. Format validity does not establish that OCR digits match every original screenshot; the user's 16-image source batch was not available for that comparison.

## Recover truncated prefix readings

Added a focused single-line retry for incomplete 04 readings. It enlarges a temporary crop from the same screenshot location and reads it with Tesseract. A prefix is superseded only when a complete, actually recognised matching mobile starts at the same coordinates; conflicting complete numbers remain reviewable. Prior evidence and manual corrections are preserved. Original uploaded images are never rewritten.

Validation: all 47 tests passed. New genuine Tesseract test first reads a visible coloured 04 prefix, then reads its wider region and obtains the complete 0499292832; the incomplete reading no longer blocks that result. Model tests cover old retained prefixes, different locations and preserved manual corrections. Production build passed.

A local-only OCR check of the embedded screenshot portion in the user's IMG_5415.png attachment recognised 0499292832 as valid. A second reading with an extra icon-derived digit remained reviewable. This input is the visible screenshot within the review UI, not the original full-resolution IMG_5373.png, and does not establish completeness of the user's entire batch. No private image was committed.

## Code cleanup

Removed 41 unused CSS rules belonging to older country cards, reports and review layouts. Removed obsolete confidence-score collection/calculation/storage from new OCR candidates, unused upload signatures and an unused navigation helper. Older confidence-only flags still migrate correctly on load; original screenshots and manual corrections are preserved.

The production queue now uses a shared, directly tested selection helper, replacing an unrelated test-only queue implementation. CSV downloads share one implementation. Authentication form code is separated from session handling. Review lookup and source lookup maps replace repeated array searches during result rendering. Application and test code use a committed, pinned Prettier formatter. TypeScript rejects unused variables and parameters, and `npm run check` runs required checks in a safe sequential order.

Validation: all 47 tests passed after these changes, including genuine OCR, large queue bookkeeping, corrections, navigation, duplicate detection, exports, persistence and confirmed deletion. Production build, standalone type check with unused-code checks, and formatting check passed. A concurrent build/typecheck initially hit a generated Next.js route-type race; standalone type checking passed after the build finished. This is not a measured numerical code-quality score or a physical-device benchmark.

## Account for every uploaded screenshot

Added an exhaustive screenshot breakdown: with a valid number, without a valid number, or waiting. These categories sum to the uploaded count. Valid detections, unique valid numbers and duplicate occurrences are reported separately, rather than adding candidate flags to a unique-number total.

A visible button opens every scanned screenshot without a valid number, including incomplete/extra-digit/invalid readings and missed/failed screenshots. Original evidence, editable corrections, normalization and deduplicated CSV export are preserved. The Missing digits tab stays focused on missing digits and no confidence ratings are introduced.

Validation: all 48 tests passed, including genuine OCR and UI integration. New tests account for 20 uploads with duplicates, overlapping flags, empty/failed inputs and queued images; corrections immediately update coverage. Production build, typecheck and formatting checks passed. The original four numbers the user expects have not been supplied, so this change does not claim to have recovered them or verified their digit accuracy.
