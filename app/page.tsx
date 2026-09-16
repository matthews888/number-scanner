'use client';

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';

type Result = { normalized: string; original: string; source: string };
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/g;

function normalizePhone(value: string) {
  let cleaned = value.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;
  if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\D/g, '')}`;
  return cleaned.replace(/\D/g, '');
}
function looksLikePhone(value: string) { const digits = value.replace(/\D/g, ''); return digits.length >= 7 && digits.length <= 15; }

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
    results.forEach(r => { if (!map.has(r.normalized)) map.set(r.normalized, r); });
    return [...map.values()];
  }, [results]);
  const duplicateCount = Math.max(0, results.length - uniqueResults.length);
  const progress = files.length ? Math.round((processed / files.length) * 100) : 0;

  function addFiles(incoming: File[]) {
    const images = incoming.filter(file => file.type.startsWith('image/'));
    setFiles(current => {
      const seen = new Set(current.map(f => `${f.name}-${f.size}-${f.lastModified}`));
      const next = [...current];
      images.forEach(file => { const key = `${file.name}-${file.size}-${file.lastModified}`; if (!seen.has(key)) { seen.add(key); next.push(file); } });
      return next;
    });
    setStatus(images.length ? `${images.length} image${images.length === 1 ? '' : 's'} added.` : 'No image files found.');
  }
  function onInput(e: ChangeEvent<HTMLInputElement>) { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }
  function onDrop(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)); }

  async function scan() {
    if (!files.length || processing) return;
    setProcessing(true); setProcessed(0); setResults([]); setStatus('Starting OCR…');
    const worker = await createWorker('eng'); const found: Result[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]; setStatus(`Scanning ${file.name}`);
        const { data } = await worker.recognize(file);
        (data.text.match(PHONE_PATTERN) ?? []).forEach(match => {
          const normalized = normalizePhone(match);
          if (looksLikePhone(normalized)) found.push({ normalized, original: match.trim(), source: file.name });
        });
        setResults([...found]); setProcessed(i + 1);
      }
      setStatus('Extraction complete');
    } catch (error) { console.error(error); setStatus('Something went wrong while scanning. Please retry.'); }
    finally { await worker.terminate(); setProcessing(false); }
  }
  function clearAll() { setFiles([]); setResults([]); setProcessed(0); setStatus(''); }
  function downloadCsv() {
    if (!uniqueResults.length) return;
    const rows = ['phone_number', ...uniqueResults.map(item => `"${item.normalized.replaceAll('"', '""')}"`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'phone-numbers.csv'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  return <main>
    <nav className="nav"><div className="brand"><span className="brandIcon">☎</span> NumberScan</div><div className="navLinks"><span>Home</span><span>How It Works</span><span>Features</span></div><button className="navButton" onClick={() => inputRef.current?.click()}>Get Started</button></nav>

    <section className="hero">
      <div className="heroCopy"><p className="kicker">TURN SCREENSHOTS INTO DATA</p><h1>Extract phone numbers<br/>from images — <em>in seconds</em></h1><p className="lead">Upload hundreds of screenshots and let NumberScan extract, clean and organize the phone numbers into one CSV file.</p><ul><li>Upload hundreds of images at once</li><li>Automatically detects phone numbers</li><li>Cleans and standardizes formats</li><li>Removes duplicates</li><li>Download as CSV</li></ul><button className="primary" onClick={() => inputRef.current?.click()}>Get Started</button></div>
      <div className="heroVisual"><div className="phoneCard"><small>SCREENSHOT</small><b>0412 345 678</b><b>+61 412 345 678</b><b>(02) 9876 4321</b><b>07911 123456</b></div><div className="arrow">→</div><div className="csv">CSV</div></div>
    </section>

    <section className="trust"><div>⚡ <b>Fast Processing</b><small>Hundreds of images</small></div><div>🔒 <b>Your Data Stays Private</b><small>Processed in your browser</small></div><div>✓ <b>Accurate Results</b><small>OCR powered extraction</small></div><div>▣ <b>Export Anytime</b><small>Download CSV</small></div></section>

    <section className="workspace">
      <div className="sectionHead"><p className="kicker">NUMBER SCANNER</p><h2>Upload Your Screenshots</h2><p>Drag and drop your images here, or click to browse.<br/>You can upload hundreds of images at once.</p></div>
      <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={e => {e.preventDefault(); setDragging(true)}} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()}>
        <div className="cloud">☁↑</div><h3>Drag & drop images here</h3><p>Supports JPG, PNG and WebP<br/>(You can select multiple files)</p><button className="primary" type="button">Choose Files</button><input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onInput}/>
      </div>
      <div className="tip">ⓘ &nbsp;Tip: For best results, use clear screenshots where the numbers are visible and not blurry.</div>
      {files.length > 0 && <div className="scanBar"><div><b>{files.length}</b> images selected</div><button className="ghost" onClick={clearAll} disabled={processing}>Clear</button><button className="primary" onClick={scan} disabled={processing}>{processing ? 'Processing…' : 'Scan Images'}</button></div>}
    </section>

    {(processing || processed > 0) && <section className="workspace processingPanel"><div className="sectionHead"><h2>{processing ? 'Processing Your Images' : 'Extraction Complete'}</h2><p>{processing ? "Hang tight! We're scanning your screenshots and extracting phone numbers." : `We found ${results.length} phone numbers (${uniqueResults.length} unique).`}</p></div><div className="progressLine"><div style={{width:`${progress}%`}}/></div><div className="progressLabel"><span>{status}</span><b>{processed} / {files.length} images</b></div></section>}

    {processed > 0 && !processing && <section className="workspace resultsPanel">
      <div className="resultsTop"><div><h2>✓ &nbsp;Extraction Complete</h2><p>Review your extracted phone numbers before downloading.</p></div><button className="primary" onClick={downloadCsv} disabled={!uniqueResults.length}>↓ Download CSV</button></div>
      <div className="stats"><div><b>{results.length}</b><span>Total Numbers Found</span></div><div><b>{uniqueResults.length}</b><span>Unique Numbers</span></div><div><b>{files.length}</b><span>Images Processed</span></div><div><b>{duplicateCount}</b><span>Duplicates Removed</span></div></div>
      {uniqueResults.length ? <div className="tableWrap"><table><thead><tr><th>#</th><th>Phone Number</th><th>Original Text</th><th>Source Image</th></tr></thead><tbody>{uniqueResults.slice(0,250).map((r,i)=><tr key={r.normalized}><td>{i+1}</td><td><b>{r.normalized}</b></td><td>{r.original}</td><td>{r.source}</td></tr>)}</tbody></table>{uniqueResults.length>250&&<p className="tableNote">Showing first 250. CSV includes all {uniqueResults.length} unique numbers.</p>}</div> : <div className="empty">No phone numbers detected. Try clearer screenshots.</div>}
    </section>}

    <footer>NumberScan · Screenshots to clean CSV · Images are processed locally and are not stored.</footer>
  </main>;
}
