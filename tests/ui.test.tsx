import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { Window } from 'happy-dom';
import { saveImage, readImages, readScreenshot } from '../lib/checkpoint';
import { classifyPhone } from '../lib/phone';
import { mergeRecognition, ScanImage, validNumbers } from '../lib/review';
import sharp from 'sharp';
import type { Session } from '@supabase/supabase-js';
// DOM integration exercises the real components and IndexedDB API. Auth is a
// local test session; seeded OCR candidates test review behaviour, not accuracy.
test('review UI saves, navigates, deduplicates, exports and restores originals', async () => {
  const window = new Window({ url: 'http://localhost:3000' });
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    Image: window.Image,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator });
  const blobs = new Map<string, Blob>();
  let sequence = 0;
  URL.createObjectURL = (blob: Blob) => {
    const url = 'blob:test-' + sequence++;
    blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    blobs.delete(url);
  };
  const { render, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
  const { default: Scanner } = await import('../app/components/Scanner');
  const user = 'ui-review-test';
  const batch = '2026-10-10T00:00:00.000Z';
  const base = (index: number): ScanImage => ({
    key: `${user}:${batch}:${index}`,
    user,
    batch,
    index,
    source: `original-${index}.png`,

    status: 'complete',
    results: [],
  });
  const records = [
    mergeRecognition(base(0), [
      {
        ...classifyPhone('048189768'),
        box: { x0: 40, y0: 46, x1: 262, y1: 70 },
        imageSize: { width: 900, height: 350 },
      },
    ]),
    mergeRecognition(base(1), [classifyPhone('045236138903')]),
    { ...base(2), status: 'empty' as const },
    mergeRecognition(base(3), [
      { ...classifyPhone('0412345678'), category: 'review', reason: 'Low OCR confidence' },
    ]),
  ];
  const originals: Buffer[] = [];
  for (const record of records) {
    const phone = ['0481897682', '0481897682', '0422345678', '0412345678'][record.index];
    const pixels = await sharp(
      Buffer.from(
        `<svg width="900" height="350"><rect width="100%" height="100%" fill="white"/><text x="40" y="70" font-size="32">${phone}</text></svg>`,
      ),
    )
      .png()
      .toBuffer();
    originals.push(pixels);
    const thumbnail = await sharp(pixels).resize(160).jpeg().toBuffer();
    await saveImage(record, {
      key: record.key,
      user,
      blob: new Blob([new Uint8Array(pixels)], { type: 'image/png' }),
      thumbnail: new Blob([new Uint8Array(thumbnail)], { type: 'image/jpeg' }),
    });
  }
  const session = { user: { id: user, email: 'test@example.test' } } as Session;
  let ui = render(<Scanner session={session} />);
  await waitFor(() => assert.ok(ui.getByRole('tab', { name: 'Flagged Numbers (2)' })));
  assert.ok(ui.getByRole('tab', { name: 'Missing digits (1)' }));
  assert.match(
    ui.getByLabelText('Screenshot accounting').textContent!,
    /4 screenshots: 1 with a valid number.*3 without a valid number.*0 waiting/,
  );
  fireEvent.click(ui.getByRole('button', { name: 'Screenshots without a valid number (3)' }));
  assert.ok(ui.getByRole('button', { name: /045236138903/ }));
  assert.ok(ui.getByRole('button', { name: /No number detected/ }));
  assert.ok(ui.getByRole('button', { name: /048189768/ }));

  assert.equal(ui.container.querySelector('details.scanOptions')?.hasAttribute('open'), false);
  fireEvent.click(ui.getByRole('tab', { name: 'Missing digits (1)' }));
  assert.equal(ui.queryByRole('button', { name: /045236138903/ }), null);
  assert.equal(ui.queryByRole('button', { name: /No number detected/ }), null);
  assert.ok(ui.getByRole('button', { name: /048189768/ }));
  fireEvent.click(ui.getByRole('tab', { name: 'Flagged Numbers (2)' }));
  fireEvent.click(ui.getByRole('button', { name: /048189768/ }));
  await waitFor(() =>
    assert.ok(ui.getByRole('img', { name: 'Original screenshot: original-0.png' })),
  );
  assert.equal(ui.queryByText('SCANNED NUMBER'), null);
  assert.equal(ui.container.querySelector('.reviewEditor strong'), null);
  assert.equal(ui.queryByLabelText('Detected number location'), null);
  fireEvent.click(ui.getByRole('button', { name: 'Zoom in' }));
  assert.equal(
    ui.container.querySelector('.screenshotFrame')?.getAttribute('style'),
    'width: 125%;',
  );
  fireEvent.click(ui.getByRole('button', { name: 'Reset zoom' }));
  const source = ui
    .getByRole('img', { name: 'Original screenshot: original-0.png' })
    .getAttribute('src')!;
  assert.deepEqual(Buffer.from(await blobs.get(source)!.arrayBuffer()), originals[0]);
  fireEvent.change(ui.getByLabelText('Correct Australian mobile'), {
    target: { value: '048189768' },
  });
  fireEvent.click(ui.getByRole('button', { name: 'Save Number' }));
  await waitFor(() => assert.match(ui.getByRole('alert').textContent!, /exactly 10 digits/));
  fireEvent.change(ui.getByLabelText('Correct Australian mobile'), {
    target: { value: '0481897682' },
  });
  fireEvent.click(ui.getByRole('button', { name: 'Save & Next' }));
  await waitFor(() => assert.ok(ui.getByRole('heading', { name: 'Review number 2 of 2' })));
  fireEvent.click(ui.getByRole('button', { name: 'Previous Number' }));
  await waitFor(() =>
    assert.equal(
      (ui.getByLabelText('Correct Australian mobile') as HTMLInputElement).value,
      '0481897682',
    ),
  );
  fireEvent.click(ui.getByRole('button', { name: 'Next Number' }));
  await waitFor(() =>
    assert.ok(ui.getByRole('img', { name: 'Original screenshot: original-1.png' })),
  );
  fireEvent.change(ui.getByLabelText('Correct Australian mobile'), {
    target: { value: '+61 481 897 682' },
  });
  fireEvent.click(ui.getByRole('button', { name: 'Save & Next' }));
  await waitFor(() => assert.ok(ui.getByRole('tab', { name: 'Flagged Numbers (0)' })));
  assert.equal(ui.queryByRole('dialog'), null);
  assert.deepEqual(validNumbers(await readImages(user)), ['0481897682', '0412345678']);
  assert.equal((await readImages(user))[1].results[0].reviewState, 'duplicate');
  fireEvent.click(ui.getByRole('tab', { name: 'Screenshots with no number (1)' }));
  fireEvent.click(ui.getByRole('button', { name: /No number detected/ }));
  await waitFor(() =>
    assert.ok(ui.getByRole('img', { name: 'Original screenshot: original-2.png' })),
  );
  fireEvent.change(ui.getByLabelText('Correct Australian mobile'), {
    target: { value: '0422345678' },
  });
  fireEvent.click(ui.getByRole('button', { name: 'Save Number' }));
  await waitFor(() => assert.ok(ui.getByRole('tab', { name: 'Screenshots with no number (0)' })));
  fireEvent.click(ui.getByRole('button', { name: 'Close' }));
  let exported = '';
  const click = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () {
    if (this.download === 'phone-numbers.csv') exported = this.href;
  };
  fireEvent.click(ui.getByRole('button', { name: 'Download CSV' }));
  assert.equal(
    await blobs.get(exported)!.text(),
    'phone_number\n0481897682\n0422345678\n0412345678',
  );
  window.HTMLAnchorElement.prototype.click = click;
  cleanup();
  ui = render(<Scanner session={session} />);
  await waitFor(() => assert.ok(ui.getByRole('tab', { name: 'Flagged Numbers (0)' })));
  fireEvent.click(ui.getByRole('tab', { name: 'Reviewed' }));
  fireEvent.click(
    ui.getByRole('button', { name: /048189768.*Manually|048189768.*Missing digits/ }),
  );
  await waitFor(() =>
    assert.ok(ui.getByRole('img', { name: 'Original screenshot: original-0.png' })),
  );
  assert.deepEqual(
    Buffer.from(await (await readScreenshot(records[0].key, user))!.blob.arrayBuffer()),
    originals[0],
  );
  cleanup();
  const secondUser = 'ui-skip-test';
  for (let n = 0; n < 2; n++) {
    const record = mergeRecognition({ ...base(n), user: secondUser, key: secondUser + ':' + n }, [
      classifyPhone('043750864'),
    ]);
    await saveImage(record, { key: record.key, user: secondUser, blob: new Blob(['original']) });
  }
  ui = render(
    <Scanner session={{ user: { id: secondUser, email: 'skip@example.test' } } as Session} />,
  );
  await waitFor(() => assert.ok(ui.getByRole('tab', { name: 'Flagged Numbers (2)' })));
  fireEvent.click(ui.getByRole('tab', { name: 'Flagged Numbers (2)' }));
  fireEvent.click(ui.getByRole('button', { name: 'Review numbers' }));
  await waitFor(() =>
    assert.ok(ui.getByRole('img', { name: 'Original screenshot: original-0.png' })),
  );
  fireEvent.click(ui.getByRole('button', { name: 'Skip for Later' }));
  await waitFor(() => assert.ok(ui.getByRole('heading', { name: 'Review number 2 of 2' })));
  fireEvent.click(ui.getByRole('button', { name: 'Mark as Unreadable' }));
  await waitFor(() => assert.ok(ui.getByRole('tab', { name: 'Flagged Numbers (1)' })));
  const skipped = await readImages(secondUser);
  assert.equal(skipped[0].results[0].reviewState, 'skipped');
  assert.equal(skipped[1].results[0].reviewState, 'unreadable');
  // Current scan deletion is separate from upload/scan and requires confirmation.
  const older = {
    ...base(8),
    user: secondUser,
    key: secondUser + ':older',
    batch: '2000-01-01T00:00:00.000Z',
  };
  await saveImage(older, { key: older.key, user: secondUser, blob: new Blob(['older original']) });
  cleanup();
  ui = render(
    <Scanner session={{ user: { id: secondUser, email: 'skip@example.test' } } as Session} />,
  );
  await waitFor(() => assert.ok(ui.getByRole('tab', { name: 'Missing digits (1)' })));
  assert.ok(ui.container.querySelector('.scannerTopActions'));
  assert.ok(
    ui.container
      .querySelector('.scannerTopActions')!
      .compareDocumentPosition(ui.container.querySelector('.dropzone')!) &
      window.Node.DOCUMENT_POSITION_FOLLOWING,
  );
  fireEvent.click(ui.getByRole('button', { name: 'Delete current scan' }));
  assert.ok(ui.getByRole('heading', { name: 'Delete current scan?' }));
  assert.equal((await readImages(secondUser)).length, 3);
  fireEvent.click(ui.getByRole('button', { name: 'Cancel' }));
  assert.ok(ui.queryByRole('dialog') === null);
  assert.equal((await readImages(secondUser)).length, 3);
  fireEvent.click(ui.getByRole('button', { name: 'Delete current scan' }));
  fireEvent.click(ui.getByRole('button', { name: 'Confirm delete' }));
  await waitFor(() => assert.match(ui.getByRole('status').textContent!, /Ready for a new lookup/));
  assert.ok(ui.queryByRole('dialog') === null);
  assert.ok(ui.queryByRole('tab', { name: 'Valid Numbers' }) === null);
  const retained = await readImages(secondUser);
  assert.equal(retained.length, 1);
  assert.equal(retained[0].key, older.key);
  assert.equal(await readScreenshot(secondUser + ':0', secondUser), undefined);
  assert.equal(await readScreenshot(secondUser + ':1', secondUser), undefined);
  assert.equal(await (await readScreenshot(older.key, secondUser))!.blob.text(), 'older original');
  assert.equal((await readImages(user)).length, 4);
  assert.equal(
    (ui.getByRole('button', { name: 'Choose Photos' }) as HTMLButtonElement).disabled,
    false,
  );
  assert.equal(
    (ui.getByRole('button', { name: 'Delete current scan' }) as HTMLButtonElement).disabled,
    true,
  );
  cleanup();
  await window.happyDOM.abort();
});
