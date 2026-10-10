'use client';

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createWorker, PSM } from 'tesseract.js';
import { Candidate, classifyPhone } from '../lib/phone';
import { recognizeFile, withTimeout } from '../lib/ocr';
import { pendingImages } from '../lib/queue';
import { saveImage, readLatest, clearSaved } from '../lib/checkpoint';
import { supabase } from '../lib/supabase';

type Result=Candidate & {source:string; imageIndex:number};
type AuthMode='signin'|'signup';
type ImageReport = { source: string; imageIndex: number; status: 'found' | 'empty' | 'failed'; count: number; error?: string };
function Screenshot({file}:{file:File}) { const[url,setUrl]=useState('');useEffect(()=>{const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next)},[file]);return <img src={url} alt={file.name} style={{maxWidth:'100%',maxHeight:500,objectFit:'contain'}}/> }
function downloadReview(rows:Result[]) { const quote=(v:string)=>'"'+v.replace(/"/g,'""')+'"';const csv=['source,extracted,reason,confidence',...rows.map(r=>[r.source,r.original,r.reason,String(r.confidence)].map(quote).join(','))].join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='numbers-needing-review.csv';link.click();URL.revokeObjectURL(url) }
function downloadNumbers(numbers:string[],name='phone-numbers.csv'){if(!numbers.length)return;const csv=['phone_number',...numbers].join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)}
function AuthScreen(){const[mode,setMode]=useState<AuthMode>('signin');const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setMessage('');const credentials={email:email.trim(),password};const{data,error}=mode==='signup'?await supabase.auth.signUp(credentials):await supabase.auth.signInWithPassword(credentials);if(error)setMessage(error.message);else if(mode==='signup'&&!data.session)setMessage('Account created. Check your email to confirm your address, then sign in.');setBusy(false)}return <main className="authPage"><section className="authCard"><div className="authBrand"><span>↗</span> NumberScan</div><h1>{mode==='signin'?'Sign in':'Create account'}</h1><p>{mode==='signin'?'Sign in to open your number scanner.':'Create an account to use NumberScan.'}</p><form onSubmit={submit} className="authForm"><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='signin'?'current-password':'new-password'} minLength={6} required/></label>{message&&<div className="authMessage">{message}</div>}<button className="primary authSubmit" disabled={busy}>{busy?'Please wait…':mode==='signin'?'Sign in':'Create account'}</button></form><button className="authSwitch" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setMessage('')}}>{mode==='signin'?'Need an account? Create account':'Already have an account? Sign in'}</button></section></main>}
function Scanner({session}:{session:Session}){const batchRef=useRef(new Date().toISOString());const editingRef=useRef<Result|null>(null);const[recovered,setRecovered]=useState<Result[]>([]);useEffect(()=>{void readLatest(session.user.id).then(rows=>setRecovered(rows.flatMap(row=>row.results.map(r=>({...r,source:row.source,imageIndex:row.index}))))).catch(()=>{})},[session.user.id]);const inputRef=useRef<HTMLInputElement>(null);const fileInputRef=useRef<HTMLInputElement>(null);const pauseRef=useRef(false);const busyRef=useRef(false);const mountedRef=useRef(true);const workerRef=useRef<Awaited<ReturnType<typeof createWorker>>|null>(null);const foundRef=useRef<Result[]>([]);const reportsRef=useRef<ImageReport[]>([]);const[reportPage,setReportPage]=useState(0);const[selectedImage,setSelectedImage]=useState<number|null>(null);const[manual,setManual]=useState('');const[resultTab,setResultTab]=useState<'valid'|'review'|'rejected'>('valid');
useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;pauseRef.current=true;void workerRef.current?.terminate().catch(()=>{});workerRef.current=null}},[]);
const[files,setFiles]=useState<File[]>([]);const[results,setResults]=useState<Result[]>([]);const[reports,setReports]=useState<ImageReport[]>([]);const[processing,setProcessing]=useState(false);const[processed,setProcessed]=useState(0);const[dragging,setDragging]=useState(false);const[message,setMessage]=useState('');const uniqueResults=useMemo(()=>{const m=new Map<string,Result>();results.filter(r=>r.category==='valid').forEach(r=>{if(!m.has(r.normalized))m.set(r.normalized,r)});return[...m.values()]},[results]);const progress=files.length?Math.round(processed/files.length*100):0;function addFiles(incoming:File[]){if(processing)return;const images=incoming.filter(f=>f.type.startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i.test(f.name));setFiles(current=>{const keys=new Set(current.map(f=>`${f.name}-${f.size}-${f.lastModified}`));return[...current,...images.filter(f=>{const key=`${f.name}-${f.size}-${f.lastModified}`;if(keys.has(key))return false;keys.add(key);return true})]});setMessage(images.length?`${images.length} image${images.length===1?'':'s'} added`:'No image files found')}function chooseFiles(e:ChangeEvent<HTMLInputElement>){addFiles(Array.from(e.target.files??[]));e.target.value=''}function dropFiles(e:DragEvent<HTMLDivElement>){e.preventDefault();setDragging(false);addFiles(Array.from(e.dataTransfer.files))}async function correctImage() {
 if(selectedImage===null)return;
 const candidate=classifyPhone(manual);
 if(candidate.category!=='valid'){setMessage('Enter a complete Australian mobile number. No digits will be guessed.');return}
 const confirmed={...candidate,reason:'Manually verified',source:files[selectedImage].name,imageIndex:selectedImage};
 foundRef.current=foundRef.current.filter(r=>!(r.imageIndex===selectedImage&&r===editingRef.current));
 foundRef.current.push(confirmed);editingRef.current=null;setResults([...foundRef.current]);setManual('');setMessage('Correction saved. Download the updated CSV.');
 try{await saveImage({key:`${session.user.id}:${batchRef.current}:${selectedImage}`,user:session.user.id,batch:batchRef.current,source:files[selectedImage].name,index:selectedImage,status:'found',results:foundRef.current.filter(r=>r.imageIndex===selectedImage)})}catch{setMessage('Correction kept in memory. Download the updated CSV before closing the page.')}
}
function retryFailed(){if(busyRef.current)return;const failed=new Set(reportsRef.current.filter(r=>r.status==='failed').map(r=>r.imageIndex));reportsRef.current=reportsRef.current.filter(r=>!failed.has(r.imageIndex));setReports([...reportsRef.current]);setProcessed(reportsRef.current.length);void scan()}
async function scan() {
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
    for (const i of pendingImages(files.length,imageReports)) {
      if (pauseRef.current || !mountedRef.current) break;
      const file = files[i];
      setMessage(`Scanning ${i + 1}/${files.length} · ${file.name}`);
      try {
        let numbers: Candidate[] = [];
        for (let attempt = 0; attempt < 2; attempt++) {
          try { numbers = await recognizeFile(file, await getWorker()); break; }
          catch (error) { await releaseWorker(); if (attempt === 1) throw error; }
        }
        found.push(...numbers.map(number => ({ ...number, source: file.name, imageIndex: i })));
        imageReports.push({ source: file.name, imageIndex: i, status: numbers.some(n=>n.category!=='rejected') ? 'found' : 'empty', count: numbers.filter(n=>n.category!=='rejected').length });
      } catch (error) {
        imageReports.push({ source: file.name, imageIndex: i, status: 'failed', count: 0, error: error instanceof Error ? error.message : 'Unknown failure' });
      } finally {
        if (mountedRef.current) {
          setResults([...found]); setReports([...imageReports]); setProcessed(imageReports.length);
          try { const report=imageReports[imageReports.length-1]; await withTimeout(saveImage({key:`${session.user.id}:${batchRef.current}:${i}`,user:session.user.id,batch:batchRef.current,source:file.name,index:i,status:report.status,results:found.filter(r=>r.imageIndex===i)}),10000); }
          catch { setMessage('Browser storage is full. Download results before closing this page.'); }
        }
      }
      // Bound the OCR engine's retained memory during multi-thousand image jobs.
      if ((i + 1) % 50 === 0) await releaseWorker();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!mountedRef.current) return;
    const unique = [...new Set(found.filter(result=>result.category==='valid').map(result => result.normalized))];
    const missed = imageReports.filter(report => report.status !== 'found').length;
    const duplicates = found.filter(r=>r.category==='valid').length - unique.length;
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
}function clear(){if(busyRef.current)return;foundRef.current=[];reportsRef.current=[];setReportPage(0);setFiles([]);setResults([]);setReports([]);setProcessed(0);setSelectedImage(null);batchRef.current=new Date().toISOString();setRecovered([]);void clearSaved(session.user.id).catch(()=>{});setMessage('')}return <main className="page"><header className="header"><div className="logo"><span>↗</span> NumberScan</div><div className="account"><a className="historyNav" href="/history">Previous scans</a><span>{session.user.email}</span><button onClick={()=>supabase.auth.signOut()}>Sign out</button></div></header><section className="scanner"><div className="intro"><p className="label">NUMBER SCANNER</p><h1>Upload screenshots</h1><p>Extract phone numbers into one clean CSV.</p></div><div className={`dropzone ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={dropFiles} onClick={()=>{if(!processing)inputRef.current?.click()}}><div className="uploadIcon">↑</div><h2>Drag & drop images here</h2><p>Select thousands of images · Processed one at a time</p><button type="button" className="primary">Choose Photos</button><button type="button" className="secondary" disabled={processing} onClick={e=>{e.stopPropagation();fileInputRef.current?.click()}}>Choose from Files</button><input ref={fileInputRef} type="file" multiple hidden disabled={processing} onChange={chooseFiles}/><input ref={inputRef} type="file" accept="image/*" multiple hidden disabled={processing} onChange={chooseFiles}/></div>{!files.length&&recovered.length>0&&<p>Previous browser checkpoint available. <button className="secondary" onClick={()=>downloadNumbers([...new Set(recovered.filter(r=>r.category==='valid').map(r=>r.normalized))],'recovered-valid-numbers.csv')}>Recover valid CSV</button><button className="secondary" onClick={()=>downloadReview(recovered.filter(r=>r.category==='review'))}>Recover review CSV</button></p>}<p>For large iPad batches, use Choose from Files. You can add images in several selections to the same queue. Keep this page open and the screen awake while scanning.</p>{files.length>0&&<div className="actions"><div><strong>{files.length}</strong> image{files.length===1?'':'s'} selected</div><button className="secondary" onClick={clear} disabled={processing}>Clear</button><button className="primary" onClick={scan} disabled={processing||processed===files.length}>{processing?`Scanning ${processed}/${files.length}`:processed>0&&processed<files.length?'Resume Scan':processed===files.length?'Scan Complete':'Scan Images'}</button>{processing&&<button className="secondary" onClick={()=>{pauseRef.current=true;setMessage("Pausing after the current image…")}}>Pause</button>}</div>}{(processing||processed>0)&&<div className="progress"><div className="progressText"><span>{message}</span><strong>{progress}%</strong></div><div className="track"><div style={{width:`${progress}%`}}/></div></div>}{processed>0&&<section className="results"><div className="resultsHeader"><div><p className="label">RESULTS</p><h2>{uniqueResults.length} unique number{uniqueResults.length===1?'':'s'}</h2></div><button className="primary" onClick={()=>downloadNumbers(uniqueResults.map(r=>r.normalized))} disabled={!uniqueResults.length}>Download CSV</button></div><div className="accuracyReport"><p>Uploaded: {files.length} · Completed: {reports.filter(r=>r.status!=='failed').length} · Failed: {reports.filter(r=>r.status==='failed').length} · Remaining: {files.length-reports.length}</p><p>Valid occurrences: {results.filter(r=>r.category==='valid').length} · Unique valid: {uniqueResults.length} · Duplicates removed: {results.filter(r=>r.category==='valid').length-uniqueResults.length}</p><p>Needs review: {results.filter(r=>r.category==='review').length} · Landlines rejected: {results.filter(r=>r.reason==='Australian landline').length} · No number detected: {reports.filter(r=>r.status==='empty').length}</p><button className="secondary" onClick={()=>downloadReview(results.filter(r=>r.category==='review'))} disabled={!results.some(r=>r.category==='review')}>Export Needs Review</button><button className="secondary" disabled={processing||!reports.some(r=>r.status==='failed')} onClick={retryFailed}>Retry failed images</button></div><details className="imageReports"><summary>{reports.length} images processed · View image results</summary><ul>{reports.slice(reportPage*100,(reportPage+1)*100).map((report,index)=><li key={`${report.source}-${index}`}><button className="secondary" onClick={()=>{setSelectedImage(report.imageIndex);editingRef.current=null;setManual('')}}>{report.source}</button><strong>{report.status==='failed'?'Scan failed — retry image':report.status==='empty'?'No number found — review image':`${report.count} number${report.count===1?'':'s'} found`}</strong></li>)}</ul><div className="actions"><button className="secondary" disabled={reportPage===0} onClick={()=>setReportPage(p=>p-1)}>Previous</button><span>Page {reportPage+1} of {Math.max(1,Math.ceil(reports.length/100))}</span><button className="secondary" disabled={(reportPage+1)*100>=reports.length} onClick={()=>setReportPage(p=>p+1)}>Next</button></div><p>Repeated numbers appear once in the CSV. Check the extracted digits before using them.</p></details><div className="actions">{(['valid','review','rejected'] as const).map(tab=><button className="secondary" key={tab} aria-pressed={resultTab===tab} onClick={()=>setResultTab(tab)}>{tab==='valid'?'Valid Numbers':tab==='review'?'Needs Review':'Rejected'}</button>)}</div><div className="tableWrap"><p>Showing up to 250 entries. Exports include all entries in the selected category.</p><table><thead><tr><th>Number / OCR text</th><th>Source / reason</th></tr></thead><tbody>{(resultTab==='valid'?uniqueResults:results.filter(r=>r.category===resultTab)).slice(0,250).map((r,index)=><tr key={`${r.imageIndex}-${index}`}><td>{resultTab==='valid'?r.normalized:r.original}</td><td><button className="secondary" onClick={()=>{setSelectedImage(r.imageIndex);editingRef.current=r;setManual(r.original)}}>{r.source}</button><p>{r.reason} · {Math.round(r.confidence)}% OCR confidence</p>{resultTab==='valid'&&<small>Sources: {[...new Set(results.filter(other=>other.category==='valid'&&other.normalized===r.normalized).map(other=>other.source))].join(', ')}</small>}</td></tr>)}</tbody></table></div>{selectedImage!==null&&files[selectedImage]&&<section className="reviewPanel"><h2>Review {files[selectedImage].name}</h2><div className="reviewColumns"><Screenshot file={files[selectedImage]}/><div>{results.filter(r=>r.imageIndex===selectedImage).map((r,i)=><p key={i}>{r.original} — {r.reason}</p>)}<label>Manually verified mobile<input value={manual} onChange={e=>setManual(e.target.value)} placeholder="0412 345 678" inputMode="tel"/></label><button className="primary" disabled={processing} onClick={correctImage}>{editingRef.current?'Save correction':'Add verified number'}</button></div></div><button className="secondary" onClick={()=>setSelectedImage(null)}>Close review</button></section>}</section>}</section><footer>Images are processed in your browser and are not stored. Valid numbers are saved to your private history. Scan evidence is checkpointed in this browser; keep the page open to retain screenshot previews.</footer></main>}
export default function Home(){const[session,setSession]=useState<Session|null>(null);const[loading,setLoading]=useState(true);useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const{data:listener}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setLoading(false)});return()=>listener.subscription.unsubscribe()},[]);if(loading)return <main className="authPage"><div className="authLoading">Loading NumberScan…</div></main>;if(!session)return <AuthScreen/>;return <Scanner session={session}/>}
