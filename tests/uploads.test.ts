import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { isZip, zipImages } from '../lib/uploads';

test('ZIP detection accepts iPad files without a MIME type', () => {
  assert.ok(isZip({ name: 'Screenshots.ZIP', type: '' }));
  assert.ok(isZip({ name: 'upload', type: 'application/x-zip-compressed' }));
  assert.ok(!isZip({ name: 'photo.png', type: 'image/png' }));
});
test('ZIP imports nested images, excludes metadata and preserves same basenames', async () => {
  const bytes = zipSync({
    'one/photo.png': strToU8('first image'),
    'two/photo.png': strToU8('second image'),
    '__MACOSX/._photo.png': strToU8('metadata'),
    '.hidden.png': strToU8('hidden'),
    'notes.txt': strToU8('not an image'),
  });
  const files = [];
  for await (const file of zipImages(new File([bytes], 'screenshots.zip'))) files.push(file);
  assert.deepEqual(
    files.map((f) => f.name),
    ['screenshots.zip/one/photo.png', 'screenshots.zip/two/photo.png'],
  );
  assert.equal(await files[1].text(), 'second image');
});
test('ZIP imports all 2,300 screenshots', async () => {
  const entries = Object.fromEntries(
    Array.from({ length: 2300 }, (_, i) => [`folder/${i}.jpg`, strToU8(`image ${i}`)]),
  );
  const bytes = zipSync(entries);
  let count = 0;
  for await (const file of zipImages(new File([bytes], 'batch.zip'))) {
    assert.equal(await file.text(), `image ${count}`);
    count++;
  }
  assert.equal(count, 2300);
});
test('unreadable ZIP reports an error', async () => {
  await assert.rejects(async () => {
    for await (const file of zipImages(new File(['invalid zip'], 'broken.zip'))) void file;
  });
});
