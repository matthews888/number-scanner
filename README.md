# Number Scanner

Next.js, React and TypeScript application for extracting Australian mobile numbers from screenshots, reviewing incomplete results, and exporting a deduplicated CSV. Tesseract runs in the browser. Original screenshots remain in IndexedDB on the user's device; Supabase provides authentication and saved number history.

## Development

```sh
npm ci
npm run dev
```

## Required checks

```sh
npm run check
```

This checks formatting, builds the application, checks TypeScript including unused locals/parameters, and runs the test suite. Build precedes standalone type checking because Next.js generates route types during the build. Run these commands sequentially: a simultaneous build can replace generated type files while TypeScript is reading them.

Use `npm run format` to apply the committed Prettier configuration.

## Code structure

- `app/components/Scanner.tsx`: retained scan state, sequential processing and result controls.
- `app/components/AuthScreen.tsx`: sign-in and account creation form.
- `app/components/ReviewViewer.tsx`: unchanged original-image display, zoom/pan and correction workflow.
- `app/components/SavedNumbers.tsx`: saved-number selection and confirmed bulk deletion.
- `lib/ocr.ts`: temporary preprocessing, Tesseract passes and focused retries.
- `lib/phone.ts`: exact digit validation and normalization; no digit invention or truncation.
- `lib/review.ts`: corrections, evidence reconciliation and valid/review exports.
- `lib/checkpoint.ts`: retained metadata and original-image storage, including older result compatibility.
- `lib/queue.ts`: the queue selection used by the real scanner.
- `lib/download.ts`: shared CSV download and object-URL cleanup.
- `lib/history.ts`: saved-number normalization, correction and deletion bookkeeping.

## Verification limits

Tests include actual Tesseract OCR on labelled images and DOM/IndexedDB integration for review, correction, exports and deletion. Queue bookkeeping covers 2,300 entries; this is not a benchmark of 2,300 full-resolution screenshots on a physical iPad. See `VALIDATION.md` for OCR evidence and limitations. Never describe a format-valid result as proof that every digit matches its source image.
