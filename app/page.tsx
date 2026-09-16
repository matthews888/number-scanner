'use client';

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createWorker } from 'tesseract.js';
import { supabase } from '../lib/supabase';

type Result = { normalized: string; original: string; source: string };
type AuthMode = 'signin' | 'signup';

const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/g;

function normalizePhone(value: string) {
  let cleaned = value.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;
  if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\D/g, '')}`;
  return cleaned.replace(/\D/g, '');
}

function isPhone(value: string) {
  const length = value.replace(/\D/g, '').length;
  return length >= 7 && length <= 15;
}

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');

    const credentials = { email: email.trim(), password };
    const { data, error } = mode === 'signup'
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);

    if (error) {
      setMessage(error.message);
    } else if (mode === 'signup' && !data.session) {
      setMessage('Account created. Check your email to confirm your address, then sign in.');
    }
    setBusy(false);
  }

  return (
    <main className="authPage">
      <section className="authCard">
        <div className="authBrand"><span>↗</span> NumberScan</div>
        <h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
        <p>{mode === 'signin' ? 'Sign in to open your number scanner.' : 'Create an account to use NumberScan.'}</p>
        <form onSubmit={submit} className="authForm">
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} required /></label>
          {message && <div className="authMessage" role="status">{message}</div>}
          <button className="primary authSubmit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="authSwitch" type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}>
          {mode === 'signin' ? 'Need an account? Create account' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  );
}

function Scanner({ session }: { session: Session }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState('');

  const uniqueResults = useMemo(() => {
    const unique = new Map<string, Result>();
    results.forEach(result => { if (!unique.has(result.normalized)) unique.set(result.normalized, result); });
    return [...unique.values()];
  }, [results]);

  const progress = files.length ? Math.round((processed / files.length) * 100) : 0;

  function addFiles(incoming: File[]) {
    const images = incoming.filter(file => file.type.startsWith('image/'));
    setFiles(current => {
      const keys = new Set(current.map(file => `${file.name}-${file.size}-${file.lastModified}`));
      return [...current, ...images.filter(file => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (keys.has(key)) return false;
        keys.add(key);
        return true;
      })];
    });
    setMessage(images.length ? `${images.length} image${images.length === 1 ? '' : 's'} added` : 'No image files found');
  }

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function dropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  async function scan() {
    if (!files.length || processing) return;
    setProcessing(true);
    setProcessed(0);
    setResults([]);
    setMessage('Starting scanner…');
    const found: Result[] = [];
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      worker = await createWorker('eng');
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setMessage(`Scanning ${file.name}`);
        const { data } = await worker.recognize(file);
        for (const match of data.text.match(PHONE_PATTERN) ?? []) {
          const normalized = normalizePhone(match);
          if (isPhone(normalized)) found.push({ normalized, original: match.trim(), source: file.name });
        }
        setResults([...found]);
        setProcessed(i + 1);
      }
      setMessage('Scan complete');
    } catch (error) {
      console.error(error);
      setMessage('Scan failed. Please try again.');
    } finally {
      if (worker) await worker.terminate();
      setProcessing(false);
    }
  }

  function clear() {
    setFiles([]);
    setResults([]);
    setProcessed(0);
    setMessage('');
  }

  function downloadCsv() {
    if (!uniqueResults.length) return;
    const csv = ['phone_number', ...uniqueResults.map(result => result.normalized)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'phone-numbers.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="page">
      <header className="header">
        <div className="logo"><span>↗</span> NumberScan</div>
        <div className="account"><span>{session.user.email}</span><button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
      </header>
      <section className="scanner">
        <div className="intro"><p className="label">NUMBER SCANNER</p><h1>Upload screenshots</h1><p>Extract phone numbers into one clean CSV.</p></div>
        <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={dropFiles} onClick={() => inputRef.current?.click()}>
          <div className="uploadIcon">↑</div><h2>Drag & drop images here</h2><p>JPG, PNG, WebP · Select multiple files</p>
          <button className="primary" type="button">Choose Files</button>
          <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={chooseFiles}/>
        </div>
        {files.length > 0 && <div className="actions"><div><strong>{files.length}</strong> image{files.length === 1 ? '' : 's'} selected</div><button className="secondary" onClick={clear} disabled={processing}>Clear</button><button className="primary" onClick={scan} disabled={processing}>{processing ? `Scanning ${processed}/${files.length}` : 'Scan Images'}</button></div>}
        {(processing || processed > 0) && <div className="progress"><div className="progressText"><span>{message}</span><strong>{progress}%</strong></div><div className="track"><div style={{ width: `${progress}%` }}/></div></div>}
        {processed > 0 && !processing && <section className="results"><div className="resultsHeader"><div><p className="label">RESULTS</p><h2>{uniqueResults.length} unique number{uniqueResults.length === 1 ? '' : 's'}</h2></div><button className="primary" onClick={downloadCsv} disabled={!uniqueResults.length}>Download CSV</button></div>{uniqueResults.length ? <div className="tableWrap"><table><thead><tr><th>Phone number</th><th>Source</th></tr></thead><tbody>{uniqueResults.slice(0,250).map(result => <tr key={result.normalized}><td>{result.normalized}</td><td>{result.source}</td></tr>)}</tbody></table>{uniqueResults.length > 250 && <p className="note">Showing 250 results. The CSV contains all {uniqueResults.length}.</p>}</div> : <div className="empty">No phone numbers found. Try clearer screenshots.</div>}</section>}
      </section>
      <footer>Images are processed in your browser and are not stored.</footer>
    </main>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setLoading(false); });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return <main className="authPage"><div className="authLoading">Loading NumberScan…</div></main>;
  if (!session) return <AuthScreen />;
  return <Scanner session={session} />;
}
