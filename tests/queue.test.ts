import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPendingImages } from '../lib/queue';
import type { ScanImage } from '../lib/review';
const image = (
  index: number,
  status: ScanImage['status'] = 'queued',
  batch = 'batch',
): ScanImage => ({
  key: `user:${batch}:${index}`,
  user: 'user',
  batch,
  index,
  status,
  source: 'same-name.png',

  results: [],
});
test('production queue accounts for 2,300 entries and retries only failures', () => {
  const records = Array.from({ length: 2300 }, (_, i) => image(i));
  assert.equal(getPendingImages(records, 'batch').length, 2300);
  for (const record of getPendingImages(records, 'batch'))
    record.status = record.index % 100 === 0 ? 'failed' : 'complete';
  assert.equal(getPendingImages(records, 'batch').length, 0);
  const retry = getPendingImages(records, 'batch', 'retry');
  assert.equal(retry.length, 23);
  assert.ok(retry.every((r) => r.status === 'failed'));
  assert.equal(records.filter((r) => r.status === 'complete').length, 2277);
  assert.equal(getPendingImages(records, 'batch', 'recheck').length, 2300);
});
test('production queue preserves upload identity and excludes completed/other scans', () => {
  const records = [
    image(0, 'complete'),
    image(1),
    image(2, 'empty'),
    image(3, 'failed'),
    image(4),
    image(5, 'queued', 'other'),
  ];
  assert.deepEqual(
    getPendingImages(records, 'batch').map((i) => i.index),
    [1, 4],
  );
  assert.deepEqual(
    getPendingImages(records, 'batch', 'retry').map((i) => i.index),
    [1, 3, 4],
  );
  assert.deepEqual(
    getPendingImages(records, 'batch', 'recheck').map((i) => i.index),
    [0, 1, 2, 3, 4],
  );
  assert.equal(new Set(getPendingImages(records, 'batch').map((i) => i.key)).size, 2);
});
test('missing retry targets unresolved screenshots without erasing completed mobiles or corrections', async () => {
  const { classifyPhone } = await import('../lib/phone');
  const finding = (number: string) => ({
    ...classifyPhone(number),
    id: number,
    reviewState: 'unresolved' as const,
  });
  const records = [
    image(0, 'complete'),
    image(1, 'complete'),
    image(2, 'empty'),
    image(3, 'failed'),
    image(4, 'complete'),
    image(5, 'complete'),
    image(6, 'complete', 'other'),
  ];
  records[0].results = [finding('04')];
  records[1].results = [finding('0412345678'), finding('5000123')];
  records[4].results = [{ ...finding('04'), corrected: '0491570006', reviewState: 'corrected' }];
  records[5].results = [finding('0212345678')];
  records[6].results = [finding('04')];
  assert.deepEqual(
    getPendingImages(records, 'batch', 'missing').map((i) => i.index),
    [0, 2, 3],
  );
});
