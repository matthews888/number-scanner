# OCR accuracy upgrade

The application retains Tesseract.js 6.0.1 and the existing authentication,
upload and history screens. It normalises only exact Australian mobile
patterns, separates valid/review/rejected candidates, and excludes uncertain
readings from valid exports. No missing digits are filled or extra digits cut.

## Checks completed

- TypeScript and Next.js production build passed.
- Automated digit-length, format, duplicates, dates, identifiers, low-confidence
  and conflicting-pass tests passed.
- Actual Tesseract OCR passed six generated image fixtures: names/dates and
  multiple numbers, dark mode, small text, mild blur, two numbers on one line,
  and no numbers. These inputs are generated images, not mocked OCR results.
- Three previously supplied real screenshots were independently viewed to
  establish their expected mobile numbers and processed with Tesseract on
  the full scaled screenshots in sparse and automatic layout modes. All three
  visible numbers were detected. Two screenshots required review; one had
  an additional conflicting reading with an extra digit. It was flagged for
  review and excluded from valid export. Actual screenshots and phone numbers
  are not committed to this public repository.
- Queue bookkeeping tests account for 2,300 entries and controlled failures.
  These are not a 2,300-image OCR or device performance benchmark.

Run `npm test` and `npm run build`. For private sample checks:
`node --import tsx tests/private-samples.ts /absolute/path/manifest.json`.
The external manifest is an array of `{path, expected}` records. Keep private
images and manifests outside the repository.

## Implementation and limits

Screenshots are decoded one at a time. Canvas dimensions are bounded to 4.5
million pixels, preprocessing yields between row chunks, canvases and object
URLs are released, and OCR workers are recycled every 50 upload indexes.
Two full-image passes run even after a detection; a third preprocessing pass
runs for missing or uncertain results. A failure after a successful OCR pass
retains that evidence in review. Worker/image failures retry once, then appear
as failed images with an explicit retry button.

Evidence checkpoints are written per image to IndexedDB in this browser.
The latest stored numbers can be recovered as valid/review CSV after reopening.
Original image bytes are not stored; screenshots must stay selected for
previews and the queue does not automatically resume after a page reload.
Browser storage can be cleared by the device. Corrections update the current
CSV and local evidence, but do not rewrite an already saved history entry.

OCR confidence is a heuristic, not an accuracy percentage. Readings below 85
or conflicting readings go to review. Matching high-confidence passes can
still share an OCR error. Generic numeric identifiers without contextual
labels may resemble mobiles and cannot be conclusively distinguished from
phone numbers using pixels alone.

Physical iPad, mobile and desktop browser flows, browser preprocessing pixel
output, IndexedDB recovery, Photos/Files selection of 2,300 screenshots, and
sustained device memory use have not been verified here. The Node screenshot
checks exercise the real OCR and classification logic, but not browser canvas
preprocessing. No claim of perfect extraction or production device readiness
is made.
