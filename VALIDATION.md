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
