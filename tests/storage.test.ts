import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveImage, readImages, readScreenshot, deleteBatch } from '../lib/checkpoint';
import { applyCorrection, mergeRecognition, ScanImage, validNumbers } from '../lib/review';
import { classifyPhone } from '../lib/phone';
test('original screenshot, corrections and statuses survive reopening IndexedDB', async () => {
  const base: ScanImage = {
    key: 'storage-test:batch:0',
    user: 'storage-test',
    batch: 'batch',
    source: 'original.png',
    index: 0,

    status: 'queued',
    results: [],
  };
  const original = new Blob(['original screenshot bytes'], { type: 'image/png' });
  await saveImage(base, { key: base.key, user: base.user, blob: original });
  const image = mergeRecognition(base, [classifyPhone('048189768')]);
  await saveImage(image);
  const corrected = applyCorrection(image, image.results[0].id, '0481897682', [image]).image;
  await saveImage(corrected);
  const rows = await readImages(base.user);
  assert.deepEqual(validNumbers(rows), ['0481897682']);
  assert.equal(rows[0].results[0].original, '048189768');
  assert.equal(
    await (await readScreenshot(base.key, base.user))!.blob.text(),
    'original screenshot bytes',
  );
  assert.equal(await readScreenshot(base.key, 'another-user'), undefined);
  await deleteBatch(base.user, base.batch);
  assert.equal((await readImages(base.user)).length, 0);
  assert.equal(await readScreenshot(base.key, base.user), undefined);
});
test('an original-image storage failure cannot commit orphan metadata', async () => {
  const image: ScanImage = {
    key: 'atomic-storage-test:0',
    user: 'atomic-storage-test',
    batch: 'batch',
    source: 'file.png',
    index: 0,

    status: 'queued',
    results: [],
  };
  await assert.rejects(
    saveImage(image, { key: image.key, user: image.user, blob: (() => {}) as unknown as Blob }),
  );
  assert.equal((await readImages(image.user)).length, 0);
});
test('retained confidence-only flags become valid without changing originals or manual decisions', async () => {
  const base: ScanImage = {
    key: 'confidence-migration:0',
    user: 'confidence-migration',
    batch: 'batch',
    source: 'original.png',
    index: 0,

    status: 'complete',
    results: [],
  };
  const old = mergeRecognition(base, [
    {
      ...classifyPhone('+61 412 345 678'),
      category: 'review',
      reason: 'Low confidence in an OCR pass',
    },
    { ...classifyPhone('048189768'), category: 'review', reason: 'Low OCR confidence' },
    {
      ...classifyPhone('0422345678'),
      category: 'review',
      reason: 'OCR passes disagree — verify screenshot',
    },
  ]);
  old.results[0].corrected = '0432345678';
  old.results[0].reviewState = 'corrected';
  await saveImage(old, { key: base.key, user: base.user, blob: new Blob(['original bytes']) });
  const rows = await readImages(base.user);
  assert.equal(rows[0].results[0].category, 'valid');
  assert.equal(rows[0].results[0].normalized, '0412345678');
  assert.equal(rows[0].results[0].original, '+61 412 345 678');
  assert.equal(rows[0].results[0].corrected, '0432345678');
  assert.equal(rows[0].results[0].reviewState, 'corrected');
  assert.equal(rows[0].results[1].category, 'review');
  assert.equal(rows[0].results[1].reason, 'Missing digits');
  assert.equal(rows[0].results[2].category, 'review');
  assert.deepEqual(validNumbers(rows), ['0432345678']);
  assert.equal(await (await readScreenshot(base.key, base.user))!.blob.text(), 'original bytes');
});
