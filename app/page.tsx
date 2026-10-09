'use client';

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createWorker, PSM } from 'tesseract.js';
import { extractPhones, ocrDimensions } from '../lib/phone';
import { supabase } from '../lib/supabase';

type Result={normalized:string;original:string;source:string};
type AuthMode='signin'|'signup';
type ImageReport = { source: string; status: 'found' | 'empty' | 'failed'; count: number };
async function prepareImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    const size = ocrDimensions(img.naturalWidth, img.naturalHeight);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not prepare image');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = Math.round(0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2]);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}
function downloadNumbers(numbers:string[],name='phone-numbers.csv'){if(!numbers.length)return;const csv=['phone_number',...numbers].join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)}
function AuthScreen(){const[mode,setMode]=useState<AuthMode>('signin');const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setMessage('');const credentials={email:email.trim(),password};const{data,error}=mode==='signup'?await supabase.auth.signUp(credentials):await supabase.auth.signInWithPassword(credentials);if(error)setMessage(error.message);else if(mode==='signup'&&!data.session)setMessage('Account created. Check your email to confirm your address, then sign in.');setBusy(false)}return <main className="authPage"><section className="authCard"><div className="authBrand"><span>↗</span> NumberScan</div><h1>{mode==='signin'?'Sign in':'Create account'}</h1><p>{mode==='signin'?'Sign in to open your number scanner.':'Create an account to use NumberScan.'}</p><form onSubmit={submit} className="authForm"><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='signin'?'current-password':'new-password'} minLength={6} required/></label>{message&&<div className="authMessage">{message}</div>}<button className="primary authSubmit" disabled={busy}>{busy?'Please wait…':mode==='signin'?'Sign in':'Create account'}</button></form><button className="authSwitch" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setMessage('')}}>{mode==='signin'?'Need an account? Create account':'Already have an account? Sign in'}</button></section></main>}
function Scanner({session}:{session:Session}){const inputRef=useRef<HTMLInputElement>(null);const[files,setFiles]=useState<File[]>([]);const[results,setResults]=useState<Result[]>([]);const[reports,setReports]=useState<ImageReport[]>([]);const[processing,setProcessing]=useState(false);const[processed,setProcessed]=useState(0);const[dragging,setDragging]=useState(false);const[message,setMessage]=useState('');const uniqueResults=useMemo(()=>{const m=new Map<string,Result>();results.forEach(r=>{if(!m.has(r.normalized))m.set(r.normalized,r)});return[...m.values()]},[results]);const progress=files.length?Math.round(processed/files.length*100):0;function addFiles(incoming:File[]){if(processing)return;const images=incoming.filter(f=>f.type.startsWith('image/'));setFiles(current=>{const keys=new Set(current.map(f=>`${f.name}-${f.size}-${f.lastModified}`));return[...current,...images.filter(f=>{const key=`${f.name}-${f.size}-${f.lastModified}`;if(keys.has(key))return false;keys.add(key);return true})]});setMessage(images.length?`${images.length} image${images.length===1?'':'s'} added`:'No image files found')}function chooseFiles(e:ChangeEvent<HTMLInputElement>){addFiles(Array.from(e.target.files??[]));e.target.value=''}function dropFiles(e:DragEvent<HTMLDivElement>){e.preventDefault();setDragging(false);addFiles(Array.from(e.dataTransfer.files))}async function scan() {
  if (!files.length || processing) return;
  setProcessing(true);
  setProcessed(0);
  setResults([]);
  setReports([]);
  setMessage('Starting scanner…');
  const found: Result[] = [];
  const imageReports: ImageReport[] = [];
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker('eng');
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setMessage(`Scanning ${i + 1}/${files.length} · ${file.name}`);
      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = await prepareImage(file);
        const { data } = await worker.recognize(canvas);
        let numbers = extractPhones(data.text);
        // A second layout mode helps conventional documents that sparse OCR misses.
        if (!numbers.length) {
          await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
          try {
            const retry = await worker.recognize(canvas);
            numbers = extractPhones(retry.data.text);
          } finally {
            await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
          }
        }
        found.push(...numbers.map(number => ({ ...number, source: file.name })));
        imageReports.push({ source: file.name, status: numbers.length ? 'found' : 'empty', count: numbers.length });
      } catch (error) {
        console.error(`Could not scan ${file.name}`, error);
        imageReports.push({ source: file.name, status: 'failed', count: 0 });
      } finally {
        // Release large pixel buffers before processing the next image.
        if (canvas) { canvas.width = 0; canvas.height = 0; }
        setResults([...found]);
        setReports([...imageReports]);
        setProcessed(i + 1);
      }
    }
    const unique = [...new Set(found.map(result => result.normalized))];
    const missed = imageReports.filter(report => report.status !== 'found').length;
    const duplicates = found.length - unique.length;
    let summary = `Scanned ${files.length}/${files.length} images · ${unique.length} unique numbers`;
    if (duplicates) summary += ` · ${duplicates} duplicate${duplicates === 1 ? '' : 's'} removed`;
    if (missed) summary += ` · ${missed} image${missed === 1 ? '' : 's'} need review`;
    if (unique.length) {
      const { error } = await supabase.from('scan_history').insert({ user_id: session.user.id, phone_numbers: unique, image_count: files.length });
      summary += error ? ' · History could not be saved' : ' · Saved to previous scans';
    }
    setMessage(summary);
  } catch (error) {
    console.error(error);
    setMessage('Scanner could not start. Please try again.');
  } finally {
    try { await worker?.terminate(); } finally { setProcessing(false); }
  }
}function clear(){setFiles([]);setResults([]);setReports([]);setProcessed(0);setMessage('')}return <main className="page"><header className="header"><div className="logo"><span>↗</span> NumberScan</div><div className="account"><a className="historyNav" href="/history">Previous scans</a><span>{session.user.email}</span><button onClick={()=>supabase.auth.signOut()}>Sign out</button></div></header><section className="scanner"><div className="intro"><p className="label">NUMBER SCANNER</p><h1>Upload screenshots</h1><p>Extract phone numbers into one clean CSV.</p></div><div className={`dropzone ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={dropFiles} onClick={()=>{if(!processing)inputRef.current?.click()}}><div className="uploadIcon">↑</div><h2>Drag & drop images here</h2><p>JPG, PNG, WebP · Select multiple files</p><button className="primary">Choose Files</button><input ref={inputRef} type="file" accept="image/*" multiple hidden disabled={processing} onChange={chooseFiles}/></div>{files.length>0&&<div className="actions"><div><strong>{files.length}</strong> image{files.length===1?'':'s'} selected</div><button className="secondary" onClick={clear} disabled={processing}>Clear</button><button className="primary" onClick={scan} disabled={processing}>{processing?`Scanning ${processed}/${files.length}`:'Scan Images'}</button></div>}{(processing||processed>0)&&<div className="progress"><div className="progressText"><span>{message}</span><strong>{progress}%</strong></div><div className="track"><div style={{width:`${progress}%`}}/></div></div>}{processed>0&&!processing&&<section className="results"><div className="resultsHeader"><div><p className="label">RESULTS</p><h2>{uniqueResults.length} unique number{uniqueResults.length===1?'':'s'}</h2></div><button className="primary" onClick={()=>downloadNumbers(uniqueResults.map(r=>r.normalized))} disabled={!uniqueResults.length}>Download CSV</button></div><details className="imageReports"><summary>{reports.length} images processed · View image results</summary><ul>{reports.map((report,index)=><li key={`${report.source}-${index}`}><span>{report.source}</span><strong>{report.status==='failed'?'Scan failed — retry image':report.status==='empty'?'No number found — review image':`${report.count} number${report.count===1?'':'s'} found`}</strong></li>)}</ul><p>Repeated numbers appear once in the CSV. Check the extracted digits before using them.</p></details>{uniqueResults.length?<div className="tableWrap"><table><thead><tr><th>Phone number</th><th>Source</th></tr></thead><tbody>{uniqueResults.slice(0,250).map(r=><tr key={r.normalized}><td>{r.normalized}</td><td>{r.source}</td></tr>)}</tbody></table></div>:<div className="empty">No phone numbers found.</div>}</section>}</section><footer>Images are processed in your browser and are not stored. Only extracted numbers are saved to your private history.</footer></main>}
export default function Home(){const[session,setSession]=useState<Session|null>(null);const[loading,setLoading]=useState(true);useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const{data:listener}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setLoading(false)});return()=>listener.subscription.unsubscribe()},[]);if(loading)return <main className="authPage"><div className="authLoading">Loading NumberScan…</div></main>;if(!session)return <AuthScreen/>;return <Scanner session={session}/>}
