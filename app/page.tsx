'use client';

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';

type Result = {
  normalized: string;
  original: string;
  source: string;
};

const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/g;

function normalizePhone(value: string) {
  let cleaned = value.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;
  if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\D/g, '')}`;
  return cleaned.replace(/\D/g, '');
}

function looksLikePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);

  const uniqueResults = useMemo(() => {
    const map = new Map<string, Result>();
    for (const result of results) {
      if (!map.has(result.normalized)) map.set(result.normalized, result);
    }
    return [...map.values()];
  }, [results]);

  function addFiles(incoming: File[]) {
    const images = incoming.filter((file) => file.type.startsWith('image/'));
    setFiles((current) => {
      const seen = new Set(current.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
      const next = [...current];
      for (const file of images) {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push(file);
        }
      }
      return next;
    });
    setStatus(images.length ? `${images.length} image${images.length === 1 ? '' : 's'} added.` : 'No image files found.');
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  async function scan() {
    if (!files.length || processing) return;
    setProcessing(true);
    setProcessed(0);
    setResults([]);
    setStatus('Starting OCR…');

    const worker = await createWorker('eng');
    const found: Result[] = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setStatus(`Scanning ${file.name}`);
        const { data } = await worker.recognize(file);
        const matches = data.text.match(PHONE_PATTERN) ?? [];

        for (const match of matches) {
          const normalized = normalizePhone(match);
          if (looksLikePhone(normalized)) {
            found.push({ normalized, original: match.trim(), source: file.name });
          }
        }

        setResults([...found]);
        setProcessed(index + 1);
      }
      setStatus('Scan complete.');
    } catch (error) {
      console.error(error);
      setStatus('Something went wrong while scanning. You can retry.');
    } finally {
      await worker.terminate();
      setProcessing(false);
    }
  }

  function clearAll() {
    setFiles([]);
    setResults([]);
    setProcessed(0);
    setStatus('');
  }

  function downloadCsv() {
    if (!uniqueResults.length) return;
    const rows = ['phone_number', ...uniqueResults.map((item) => `"${item.normalized.replaceAll('"', '""')}"`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'phone-numbers.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const progress = files.length ? Math.round((processed / files.length) * 100) : 0;

  return (
    <main className="shell">
      <section className="card">
        <header className="topbar">
          <div>
            <p className="eyebrow">NUMBER SCANNER</p>
            <h1>Screenshots to CSV</h1>
            <p className="subcopy">Upload screenshots, extract phone numbers, remove duplicates and download one clean CSV.</p>
          </div>
          {(files.length > 0 || results.length > 0) && (
            <button className="textButton" onClick={clearAll} disabled={processing}>Clear all</button>
          )}
        </header>

        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }}
        >
          <div className="uploadIcon">↑</div>
          <h2>Drop screenshots here</h2>
          <p>or click to choose images</p>
          <span>PNG, JPG, JPEG, WEBP</span>
          <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onInput} />
        </div>

        <div className="actionRow">
          <div className="fileSummary">
            <strong>{files.length}</strong>
            <span>screenshots ready</span>
          </div>
          <button className="primary" onClick={scan} disabled={!files.length || processing}>
            {processing ? `Scanning ${processed}/${files.length}` : 'Scan screenshots'}
          </button>
        </div>

        {(processing || processed > 0) && (
          <div className="progressWrap" aria-live="polite">
            <div className="progressMeta">
              <span>{status}</span>
              <strong>{progress}%</strong>
            </div>
            <div className="progressTrack"><div className="progressBar" style={{ width: `${progress}%` }} /></div>
          </div>
        )}

        <section className="results">
          <div className="resultsHeader">
            <div>
              <p className="eyebrow">RESULTS</p>
              <h2>{uniqueResults.length} unique phone number{uniqueResults.length === 1 ? '' : 's'}</h2>
            </div>
            <button className="secondary" onClick={downloadCsv} disabled={!uniqueResults.length}>Download CSV</button>
          </div>

          {uniqueResults.length ? (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr><th>Phone number</th><th>Source image</th></tr>
                </thead>
                <tbody>
                  {uniqueResults.slice(0, 250).map((item) => (
                    <tr key={item.normalized}>
                      <td>{item.normalized}</td>
                      <td>{item.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {uniqueResults.length > 250 && <p className="tableNote">Showing the first 250 results. The CSV includes all {uniqueResults.length} numbers.</p>}
            </div>
          ) : (
            <div className="emptyState">Your extracted numbers will appear here.</div>
          )}
        </section>
      </section>
      <p className="privacy">Images are processed in your browser and are not saved by this app.</p>
    </main>
  );
}
