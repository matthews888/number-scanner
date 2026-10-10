import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { candidatesFromData } from '../lib/ocr';
// Generated labelled fixtures are input images, never mocked OCR output.
const fixtures = [
  {
    name: 'normal, names and dates',
    lines: ['Alice 0412 345 678', '10/10/2026', 'Bob +61 422 111 222'],
    expected: ['0412345678', '0422111222'],
    font: 32,
  },
  { name: 'dark mode', lines: ['0412-345-678'], expected: ['0412345678'], font: 32, dark: true },
  { name: 'small text', lines: ['Mobile 0412 345 678'], expected: ['0412345678'], font: 16 },
  { name: 'blurred', lines: ['0412 345 678'], expected: ['0412345678'], font: 32, blur: 0.7 },
  {
    name: 'two mobiles on the same line',
    lines: ['0412 345 678    0422 111 222'],
    expected: ['0412345678', '0422111222'],
    font: 32,
  },
  {
    name: '7 through 12 digits',
    lines: [7, 8, 9, 10, 11, 12].map((n) => '041234567890'.slice(0, n)),
    expected: [7, 8, 9, 10, 11, 12].map((n) => '041234567890'.slice(0, n)),
    font: 24,
  },
  {
    name: 'repeated digit fragments stay reviewable',
    lines: [7, 8, 9, 10, 11, 12].map((n) => '04' + '1'.repeat(n - 2)),
    expected: [7, 8, 9, 10, 11, 12].map((n) => '04' + '1'.repeat(n - 2)),
    font: 24,
    uncertain: true,
  },
  { name: 'no phone', lines: ['Hello Alice', 'Meeting tomorrow'], expected: [], font: 32 },
];
test('real Tesseract OCR on eight fixture images', async () => {
  const worker = await createWorker('eng');
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    for (const f of fixtures) {
      const svg = `<svg width="900" height="550"><rect width="100%" height="100%" fill="${f.dark ? '#111' : 'white'}"/>${f.lines.map((t, i) => `<text x="40" y="${70 + i * 80}" font-family="DejaVu Sans" font-size="${f.font}" fill="${f.dark ? 'white' : 'black'}">${t}</text>`).join('')}</svg>`;
      let pipeline = sharp(Buffer.from(svg));
      if (f.blur) pipeline = pipeline.blur(f.blur);
      const image = await pipeline.png().toBuffer();
      const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
      const candidates = candidatesFromData(data);
      const actual = [
        ...new Set(candidates.filter((c) => c.category !== 'rejected').map((c) => c.normalized)),
      ].sort();
      console.log(JSON.stringify({ fixture: f.name, text: data.text, candidates }));
      if ('uncertain' in f && f.uncertain) {
        assert.ok(
          candidates.length >= f.lines.length,
          'Retain readable prefixes from every repeated-digit row',
        );
        assert.ok(
          candidates
            .filter((c) => c.category === 'valid')
            .every((c) => f.expected.includes(c.normalized)),
          'Do not accept fabricated readings',
        );
      } else assert.deepEqual(actual, f.expected.slice().sort(), f.name);
    }
  } finally {
    await worker.terminate();
  }
});
test('real multi-pass OCR preserves complete matching mobiles without confidence gating', async () => {
  const { reconcilePasses } = await import('../lib/ocr');
  const worker = await createWorker('eng');
  try {
    for (const dark of [false, true]) {
      const pixels = await sharp(
        Buffer.from(
          `<svg width="900" height="550"><rect width="100%" height="100%" fill="${dark ? '#111' : 'white'}"/><text x="40" y="120" font-family="DejaVu Sans" font-size="42" fill="${dark ? 'white' : 'black'}">0491 570 006</text></svg>`,
        ),
      )
        .png()
        .toBuffer();
      const passes = [];
      for (const mode of [PSM.SPARSE_TEXT, PSM.AUTO]) {
        await worker.setParameters({ tessedit_pageseg_mode: mode });
        const { data } = await worker.recognize(pixels, {}, { text: true, blocks: true });
        passes.push(candidatesFromData(data));
      }
      assert.ok(
        passes.every((p) => p.some((c) => c.normalized === '0491570006')),
        'Actual OCR must find the visible mobile in both passes',
      );
      const result = reconcilePasses(passes);
      assert.ok(result.some((c) => c.normalized === '0491570006'));
      for (const c of result.filter((c) => c.normalized === '0491570006')) {
        assert.equal(c.category, 'valid');
      }
      assert.ok(
        result.filter((c) => c.category === 'valid').every((c) => c.normalized === '0491570006'),
      );
    }
  } finally {
    await worker.terminate();
  }
});
test('real OCR recovers a coloured complete mobile from a separately read 04 prefix', async () => {
  const { recoveryRegions, reconcilePasses } = await import('../lib/ocr');
  const worker = await createWorker('eng');
  try {
    const pixels = await sharp(
      Buffer.from(
        `<svg width="1000" height="650"><rect width="100%" height="100%" fill="white"/><text x="40" y="70" font-family="DejaVu Sans" font-size="20">Profile contact details</text><rect x="320" y="210" width="580" height="290" fill="white" stroke="#ddd"/><text x="350" y="260" font-family="DejaVu Sans" font-size="16">I accept SMS messages</text><text x="350" y="300" font-family="DejaVu Sans" font-size="16">Mobile</text><text x="350" y="350" font-family="DejaVu Sans" font-size="28" fill="#c34cd6">0499 292 832</text><text x="350" y="430" font-family="DejaVu Sans" font-size="16">Please contact by message</text><text x="40" y="560" font-family="DejaVu Sans" font-size="16">Updated 2 weeks ago</text></svg>`,
      ),
    )
      .png()
      .toBuffer();
    // Actual OCR of the visible prefix, followed by actual OCR of its wider region.
    const left = 348,
      top = 318;
    const prefix = await sharp(pixels)
      .extract({ left, top, width: 39, height: 42 })
      .resize(78, 84)
      .png()
      .toBuffer();
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
    const first = await worker.recognize(prefix, {}, { text: true, blocks: true });
    const partials = candidatesFromData(first.data).map((c) => ({
      ...c,
      box: c.box
        ? {
            x0: left + c.box.x0 / 2,
            y0: top + c.box.y0 / 2,
            x1: left + c.box.x1 / 2,
            y1: top + c.box.y1 / 2,
          }
        : undefined,
    }));
    assert.ok(
      partials.some((c) => c.normalized === '04'),
      JSON.stringify(first.data.text),
    );
    const regions = recoveryRegions(partials, 1000, 650);
    assert.ok(regions.length);
    const passes = [partials];
    for (const region of regions) {
      const image = await sharp(pixels)
        .extract(region)
        .resize(region.width * 2, region.height * 2)
        .greyscale()
        .normalise()
        .png()
        .toBuffer();
      const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
      passes.push(
        candidatesFromData(data).map((c) => ({
          ...c,
          box: c.box
            ? {
                x0: region.left + c.box.x0 / 2,
                y0: region.top + c.box.y0 / 2,
                x1: region.left + c.box.x1 / 2,
                y1: region.top + c.box.y1 / 2,
              }
            : undefined,
        })),
      );
    }
    const results = reconcilePasses(passes);
    assert.deepEqual(
      results.filter((c) => c.category === 'valid').map((c) => c.normalized),
      ['0499292832'],
    );
    assert.equal(results.find((c) => c.normalized === '04')?.category, 'rejected');
    assert.equal(results.filter((c) => c.category === 'review').length, 0);
  } finally {
    await worker.terminate();
  }
});
