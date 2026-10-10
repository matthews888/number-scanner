'use client';

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createWorker, PSM } from 'tesseract.js';
import { extractPhones, ocrDimensions } from '../lib/phone';
import { supabase } from '../lib/supabase';

type Result={normalized:string;original:string;source:string};
type AuthMode='signin'|'signup';
function withTimeout<T>(promise: Promise<T>, milliseconds = 90000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Image processing timed out')), milliseconds); })]).finally(() => clearTimeout(timer));
}
type ImageReport = { source: string; status: 'found' | 'empty' | 'failed'; count: number };
async function prepareImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await withTimeout(img.decode(), 30000);
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
function Scanner({session}:{session:Session}){const inputRef=useRef<HTMLInputElement>(null);const fileInputRef=useRef<HTMLInputElement>(null);const pauseRef=useRef(false);const busyRef=useRef(false);const mountedRef=useRef(true);const workerRef=useRef<Awaited<ReturnType<typeof createWorker>>|null>(null);const foundRef=useRef<Result[]>([]);const reportsRef=useRef<ImageReport[]>([]);const[reportPage,setReportPage]=useState(0);
useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;pauseRef.current=true;void workerRef.current?.terminate().catch(()=>{});workerRef.current=null}},[]);
const[files,setFiles]=useState<File[]>([]);const[results,setResults]=useState<Result[]>([]);const[reports,setReports]=useState<ImageReport[]>([]);const[processing,setProcessing]=useState(false);const[processed,setProcessed]=useState(0);const[dragging,setDragging]=useState(false);const[message,setMessage]=useState('');const uniqueResults=useMemo(()=>{const m=new Map<string,Result>();results.forEach(r=>{if(!m.has(r.normalized))m.set(r.normalized,r)});return[...m.values()]},[results]);const progress=files.length?Math.round(processed/files.length*100):0;function addFiles(incoming:File[]){if(processing)return;const images=incoming.filter(f=>f.type.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i.test(f.name));setFiles(current=>{const keys=new Set(current.map(f=>`${f.name}-${f.size}-${f.lastModified}`));return[...current,...images.filter(f=>{const key=`${f.name}-${f.size}-${f.lastModified}`;if(keys.has(key))return false;keys.add(key);return true})]});setMessage(images.length?`${images.length} image${images.length===1?'':'s'} added`:'No image files found')}function chooseFiles(e:ChangeEvent<HTMLInputElement>){addFiles(Array.from(e.target.files??[]));e.target.value=''}function dropFiles(e:DragEvent<HTMLDivElement>){e.preventDefault();setDragging(false);addFiles(Array.from(e.dataTransfer.files))}async function scan() {
  if (!files.length || busyRef.current) return;
  busyRef.current = true;
  pauseRef.current = false;
  setProcessing(true);
  setMessage('Starting scanner…');
  const found = foundRef.current;
  const imageReports = reportsRef.current;
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  async function releaseWorker() {
    const old = worker;
    worker = null;
    workerRef.current = null;
    if (old) await withTimeout(old.terminate(), 5000).catch(() => {});
  }
  async function getWorker() {
    if (!worker) {
      const pending = createWorker('eng');
      // A late startup must not leave an orphan worker after a timeout/unmount.
      let abandoned = false;
      pending.then(created => { if (abandoned || !mountedRef.current) void created.terminate().catch(() => {}); }).catch(() => {});
      try { worker = await withTimeout(pending); } catch (error) { abandoned = true; throw error; }
      workerRef.current = worker;
      await withTimeout(worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT }));
    }
    return worker;
  }
  try {
    await getWorker();
    for (let i = imageReports.length; i < files.length; i++) {
      if (pauseRef.current || !mountedRef.current) break;
      const file = files[i];
      setMessage(`Scanning ${i + 1}/${files.length} · ${file.name}`);
      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = await prepareImage(file);
        let numbers: ReturnType<typeof extractPhones> = [];
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const active = await getWorker();
            const { data } = await withTimeout(active.recognize(canvas));
            numbers = extractPhones(data.text);
            if (!numbers.length) {
              await withTimeout(active.setParameters({ tessedit_pageseg_mode: PSM.AUTO }));
              const retry = await withTimeout(active.recognize(canvas));
              numbers = extractPhones(retry.data.text);
              await withTimeout(active.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT }));
            }
            break;
          } catch (error) {
            await releaseWorker();
            if (attempt === 1) throw error;
          }
        }
        found.push(...numbers.map(number => ({ ...number, source: file.name })));
        imageReports.push({ source: file.name, status: numbers.length ? 'found' : 'empty', count: numbers.length });
      } catch (error) {
        console.error(`Could not scan ${file.name}`, error);
        imageReports.push({ source: file.name, status: 'failed', count: 0 });
      } finally {
        if (canvas) { canvas.width = 0; canvas.height = 0; }
        if (mountedRef.current) {
          setResults([...found]);
          setReports([...imageReports]);
          setProcessed(imageReports.length);
        }
      }
      // Bound the OCR engine's retained memory during multi-thousand image jobs.
      if ((i + 1) % 50 === 0) await releaseWorker();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!mountedRef.current) return;
    const unique = [...new Set(found.map(result => result.normalized))];
    const missed = imageReports.filter(report => report.status !== 'found').length;
    const duplicates = found.length - unique.length;
    const complete = imageReports.length === files.length;
    let summary = `${complete ? 'Scanned' : 'Paused at'} ${imageReports.length}/${files.length} images · ${unique.length} unique numbers`;
    if (duplicates) summary += ` · ${duplicates} duplicates removed`;
    if (missed) summary += ` · ${missed} images need review`;
    if (complete && unique.length) {
      try {
        const { error } = await withTimeout(Promise.resolve(supabase.from('scan_history').insert({ user_id: session.user.id, phone_numbers: unique, image_count: imageReports.length })), 15000);
        summary += error ? ' · History could not be saved; download your CSV' : ' · Saved to previous scans';
      } catch { summary += ' · History could not be saved; download your CSV'; }
    }
    setMessage(summary);
  } catch (error) {
    console.error(error);
    if (mountedRef.current) setMessage('Scanner could not start. Your progress is kept here; press Resume to try again.');
  } finally {
    await releaseWorker();
    busyRef.current = false;
    if (mountedRef.current) setProcessing(false);
  }
}function clear(){if(busyRef.current)return;foundRef.current=[];reportsRef.current=[];setReportPage(0);setFiles([]);setResults([]);setReports([]);setProcessed(0);setMessage('')}return <main className="page"><header className="header"><div className="logo"><span>↗</span> NumberScan</div><div className="account"><a className="historyNav" href="/history">Previous scans</a><span>{session.user.email}</span><button onClick={()=>supabase.auth.signOut()}>Sign out</button></div></header><section className="scanner"><div className="intro"><p className="label">NUMBER SCANNER</p><h1>Upload screenshots</h1><p>Extract phone numbers into one clean CSV.</p></div><div className={`dropzone ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={dropFiles} onClick={()=>{if(!processing)inputRef.current?.click()}}><div className="uploadIcon">↑</div><h2>Drag & drop images here</h2><p>Select thousands of images · Processed one at a time</p><button type="button" className="primary">Choose Photos</button><button type="button" className="secondary" disabled={processing} onClick={e=>{e.stopPropagation();fileInputRef.current?.click()}}>Choose from Files</button><input ref={fileInputRef} type="file" multiple hidden disabled={processing} onChange={chooseFiles}/><input ref={inputRef} type="file" accept="image/*" multiple hidden disabled={processing} onChange={chooseFiles}/></div><p>For large iPad batches, use Choose from Files. You can add images in several selections to the same queue. Keep this page open and the screen awake while scanning.</p>{files.length>0&&<div className="actions"><div><strong>{files.length}</strong> image{files.length===1?'':'s'} selected</div><button className="secondary" onClick={clear} disabled={processing}>Clear</button><button className="primary" onClick={scan} disabled={processing||processed===files.length}>{processing?`Scanning ${processed}/${files.length}`:processed>0&&processed<files.length?'Resume Scan':processed===files.length?'Scan Complete':'Scan Images'}</button>{processing&&<button className="secondary" onClick={()=>{pauseRef.current=true;setMessage("Pausing after the current image…")}}>Pause</button>}</div>}{(processing||processed>0)&&<div className="progress"><div className="progressText"><span>{message}</span><strong>{progress}%</strong></div><div className="track"><div style={{width:`${progress}%`}}/></div></div>}{processed>0&&<section className="results"><div className="resultsHeader"><div><p className="label">RESULTS</p><h2>{uniqueResults.length} unique number{uniqueResults.length===1?'':'s'}</h2></div><button className="primary" onClick={()=>downloadNumbers(uniqueResults.map(r=>r.normalized))} disabled={!uniqueResults.length}>Download CSV</button></div><details className="imageReports"><summary>{reports.length} images processed · View image results</summary><ul>{reports.slice(reportPage*100,(reportPage+1)*100).map((report,index)=><li key={`${report.source}-${index}`}><span>{report.source}</span><strong>{report.status==='failed'?'Scan failed — retry image':report.status==='empty'?'No number found — review image':`${report.count} number${report.count===1?'':'s'} found`}</strong></li>)}</ul><div className="actions"><button className="secondary" disabled={reportPage===0} onClick={()=>setReportPage(p=>p-1)}>Previous</button><span>Page {reportPage+1} of {Math.max(1,Math.ceil(reports.length/100))}</span><button className="secondary" disabled={(reportPage+1)*100>=reports.length} onClick={()=>setReportPage(p=>p+1)}>Next</button></div><p>Repeated numbers appear once in the CSV. Check the extracted digits before using them.</p></details>{uniqueResults.length?<div className="tableWrap"><p>Showing the first {Math.min(250,uniqueResults.length)} numbers. Your CSV includes all {uniqueResults.length}.</p><table><thead><tr><th>Phone number</th><th>Source</th></tr></thead><tbody>{uniqueResults.slice(0,250).map(r=><tr key={r.normalized}><td>{r.normalized}</td><td>{r.source}</td></tr>)}</tbody></table></div>:<div className="empty">No phone numbers found.</div>}</section>}</section><footer>Images are processed in your browser and are not stored. Only extracted numbers are saved to your private history.</footer></main>}
export default function Home(){const[session,setSession]=useState<Session|null>(null);const[loading,setLoading]=useState(true);useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const{data:listener}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setLoading(false)});return()=>listener.subscription.unsubscribe()},[]);if(loading)return <main className="authPage"><div className="authLoading">Loading NumberScan…</div></main>;if(!session)return <AuthScreen/>;return <Scanner session={session}/>}
