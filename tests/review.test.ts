import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCorrection,
  scanAccounting,
  flaggedItems,
  markReviewed,
  mergeRecognition,
  missedItems,
  reviewCSV,
  ScanImage,
  validCSV,
  validNumbers,
} from '../lib/review';
import { classifyPhone, extractPhones } from '../lib/phone';
const image = (index = 0): ScanImage => ({
  key: `user:batch:${index}`,
  user: 'user',
  batch: 'batch',
  source: 'same-name.png',
  index,

  status: 'complete',
  results: [],
});
const flagged = (index = 0) => mergeRecognition(image(index), [classifyPhone('048189768')]);
test('correction validates, resolves flag and updates CSV while preserving original', () => {
  const original = flagged();
  const id = original.results[0].id;
  const result = applyCorrection(original, id, '0481897682', [original]);
  assert.equal(flaggedItems([result.image]).length, 0);
  assert.equal(result.image.results[0].original, '048189768');
  assert.equal(result.image.results[0].reviewState, 'corrected');
  assert.equal(validCSV([result.image]), 'phone_number\n0481897682');
  assert.throws(() => applyCorrection(original, id, '048189768', [original]));
  assert.throws(() => applyCorrection(original, id, '0281897682', [original]));
});
test('normalised duplicates are linked, not exported twice', () => {
  const a = applyCorrection(flagged(), flagged().results[0].id, '0481897682', []).image;
  const b = flagged(1);
  const corrected = applyCorrection(b, b.results[0].id, '+61 481 897 682', [a, b]);
  assert.equal(corrected.duplicate, true);
  assert.equal(corrected.image.results[0].reviewState, 'duplicate');
  assert.deepEqual(validNumbers([a, corrected.image]), ['0481897682']);
  assert.equal(corrected.image.source, a.source);
  assert.notEqual(corrected.image.key, a.key);
});
test('missed and failed screenshots enter review; manual add resolves missed image', () => {
  const empty = { ...image(), status: 'empty' as const };
  const fail = { ...image(1), status: 'failed' as const };
  assert.equal(missedItems([empty, fail]).length, 2);
  const corrected = applyCorrection(empty, empty.key + ':missed', '0412345678', [empty]).image;
  assert.equal(missedItems([corrected]).length, 0);
  assert.deepEqual(validNumbers([corrected]), ['0412345678']);
});
test('skip remains unresolved; unreadable retained in reviewed evidence', () => {
  const a = flagged();
  const id = a.results[0].id;
  const skipped = markReviewed(a, id, 'skipped');
  assert.equal(flaggedItems([skipped]).length, 1);
  assert.equal(skipped.results[0].reviewState, 'skipped');
  const unreadable = markReviewed(a, id, 'unreadable');
  assert.equal(flaggedItems([unreadable]).length, 0);
  assert.equal(flaggedItems([unreadable], true).length, 1);
  assert.deepEqual(validNumbers([unreadable]), []);
});
test('editing a previous correction revalidates and replaces exported value', () => {
  const a = flagged();
  const first = applyCorrection(a, a.results[0].id, '0412345678', [a]).image;
  const second = applyCorrection(first, first.results[0].id, '0422345678', [first]).image;
  assert.deepEqual(validNumbers([second]), ['0422345678']);
  assert.equal(second.results.length, 1);
});
test('OCR failure or retry never erases evidence or corrections', () => {
  const a = flagged();
  const corrected = applyCorrection(a, a.results[0].id, '0412345678', [a]).image;
  const failed = mergeRecognition(corrected, [], 'timeout');
  assert.equal(failed.results.length, 1);
  assert.deepEqual(validNumbers([failed]), ['0412345678']);
  const retried = mergeRecognition(failed, [classifyPhone('048189768')]);
  assert.equal(retried.results.length, 1);
  assert.deepEqual(validNumbers([retried]), ['0412345678']);
});
test('unresolved exports account for 2,300 flagged images', () => {
  const images = Array.from({ length: 2300 }, (_, i) => flagged(i));
  const items = flaggedItems(images);
  assert.equal(items.length, 2300);
  assert.equal(reviewCSV(items).split('\n').length, 2301);
  assert.equal(validCSV(images), 'phone_number');
});
test('recoverable prefixes and OCR characters are never silently discarded', () => {
  for (const raw of ['O412345678', '10412345678', '412345678', '0412', '0412O45678'])
    assert.equal(extractPhones(raw)[0].category, 'review');
  assert.equal(classifyPhone('0+412345678').category, 'review');
});
test('a manually recovered missed number can be reopened and edited without accumulating old values', () => {
  const empty = { ...image(), status: 'empty' as const };
  const first = applyCorrection(empty, empty.key + ':missed', '0412345678', [empty]).image;
  const item = missedItems([first], true)[0];
  assert.equal(item.finding?.corrected, '0412345678');
  const second = applyCorrection(first, item.finding!.id, '0422345678', [first]).image;
  assert.deepEqual(validNumbers([second]), ['0422345678']);
  assert.equal(second.results.length, 1);
  assert.equal(missedItems([second]).length, 0);
});
test('fresh valid OCR updates unresolved evidence but does not overwrite manual review', () => {
  const old = mergeRecognition(image(), [
    { ...classifyPhone('0412345678'), category: 'review', reason: 'Low confidence in an OCR pass' },
  ]);
  const refreshed = mergeRecognition(old, [classifyPhone('0412345678')]);
  assert.deepEqual(validNumbers([refreshed]), ['0412345678']);
  assert.equal(refreshed.results.length, 1);
  const manual = applyCorrection(old, old.results[0].id, '0422345678', [old]).image;
  const retried = mergeRecognition(manual, [classifyPhone('0412345678')]);
  assert.deepEqual(validNumbers([retried]), ['0422345678']);
  assert.equal(retried.results[0].original, '0412345678');
});
test('a recognised full mobile supersedes an old prefix only at the same location', () => {
  const box = { x0: 50, y0: 100, x1: 75, y1: 120 };
  const partial = { ...classifyPhone('04'), box };
  const full = { ...classifyPhone('0499292832'), box: { ...box, x1: 240 } };
  const old = mergeRecognition(image(), [partial]);
  const retry = mergeRecognition(old, [full]);
  assert.deepEqual(validNumbers([retry]), ['0499292832']);
  assert.equal(flaggedItems([retry]).length, 0);
  assert.equal(retry.results[0].original, '04');
  assert.equal(
    mergeRecognition(old, [{ ...full, box: { ...full.box, y0: 180, y1: 200 } }]).results[0]
      .category,
    'review',
  );
  const corrected = applyCorrection(old, old.results[0].id, '0412345678', [old]).image;
  const rerun = mergeRecognition(corrected, [full]);
  assert.equal(rerun.results[0].corrected, '0412345678');
  assert.equal(rerun.results[0].reviewState, 'corrected');
});

test('report counts normalized mobile duplicates and excluded landlines without counting OCR retries twice', () => {
  const a = mergeRecognition(image(0), [
    classifyPhone('0412 345 678'),
    classifyPhone('02 1234 5678'),
    classifyPhone('+61 2 1234 5678'),
  ]);
  const b = mergeRecognition(image(1), [
    classifyPhone('+61 412 345 678'),
    classifyPhone('03 1234 5678'),
  ]);
  const rows = [a, b];
  const report = scanAccounting(rows);
  assert.equal(report.duplicates, 1);
  assert.equal(report.landlines, 2);
  assert.equal(report.uniqueValid, 1);
  assert.equal(validCSV(rows), 'phone_number\n0412345678');
  const corrected = applyCorrection(b, b.results[1].id, '0422345678', rows).image;
  assert.equal(scanAccounting([a, corrected]).landlines, 1);
  assert.equal(scanAccounting([a, corrected]).uniqueValid, 2);
});

test('every screenshot is accounted for independently of duplicate and flagged findings', () => {
  const rows = Array.from({ length: 20 }, (_, i) => image(i));
  for (let i = 0; i < 16; i++) rows[i] = mergeRecognition(rows[i], [classifyPhone('0412345678')]);
  rows[16] = flagged(16);
  rows[17] = { ...image(17), status: 'empty' };
  rows[18] = { ...image(18), status: 'failed' };
  rows[19] = { ...image(19), status: 'queued' };
  rows[0] = mergeRecognition(rows[0], [classifyPhone('04')]);
  const report = scanAccounting(rows);
  assert.equal(report.uploaded, 20);
  assert.equal(report.withValid, 16);
  assert.equal(report.withoutValid.length, 3);
  assert.equal(report.waiting, 1);
  assert.equal(report.withValid + report.withoutValid.length + report.waiting, 20);
  assert.equal(report.validDetections, 16);
  assert.equal(report.uniqueValid, 1);
  assert.equal(report.duplicates, 15);
  assert.deepEqual(
    report.withoutValid.map((i) => i.image.index),
    [16, 17, 18],
  );
  const item = report.withoutValid[0];
  rows[16] = applyCorrection(item.image, item.finding!.id, '0481897682', rows).image;
  assert.equal(scanAccounting(rows).withValid, 17);
  assert.equal(scanAccounting(rows).withoutValid.length, 2);
});
