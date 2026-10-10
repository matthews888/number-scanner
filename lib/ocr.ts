import { createWorker, PSM } from 'tesseract.js';
import { Candidate, extractPhones, ocrDimensions, supersedePartialReadings } from './phone';
export function withTimeout<T>(promise: Promise<T>, milliseconds = 90000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Image processing timed out')), milliseconds); })]).finally(() => clearTimeout(timer));
}
export async function prepareImage(file: File, variant = 0) {
  const url = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  try {
    const img = new Image(); img.src = url;
    await withTimeout(img.decode(), 30000);
    const size = ocrDimensions(img.naturalWidth, img.naturalHeight);
    canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not prepare image');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (variant) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gray = new Uint8Array(canvas.width * canvas.height);
      let total = 0;
      for (let p = 0; p < gray.length; p++) {
        gray[p] = Math.round(.299 * pixels.data[p*4] + .587 * pixels.data[p*4+1] + .114 * pixels.data[p*4+2]); total += gray[p];
      }
      const invert = total / gray.length < 128;
      for (let y = 0; y < canvas.height; y++) {
        if(y%128===0)await new Promise(resolve=>setTimeout(resolve,0));
        for (let x = 0; x < canvas.width; x++) {
        const p = y * canvas.width + x;
        let g = gray[p];
        if (x > 0 && y > 0 && x < canvas.width-1 && y < canvas.height-1) {
          const mean = (gray[p-1]+gray[p+1]+gray[p-canvas.width]+gray[p+canvas.width])/4;
          // Mild denoise for threshold pass, unsharp mask for contrast pass.
          g = variant === 2 ? (g * 3 + mean) / 4 : g + .5 * (g - mean);
        }
        if (invert) g = 255 - g;
        g = variant === 2 ? (g > 150 ? 255 : 0) : Math.max(0, Math.min(255, (g - 128) * 1.4 + 128));
        pixels.data[p*4] = pixels.data[p*4+1] = pixels.data[p*4+2] = g;
      }
      }
      ctx.putImageData(pixels, 0, 0);
    }
    return canvas;
  } catch (error) { canvas.width = canvas.height = 0; throw error; }
  finally { URL.revokeObjectURL(url); }
}
// Retain the weakest word confidence and bounding box of each numeric line.
export function candidatesFromData(data: import('tesseract.js').Page): Candidate[] {
  const lines = data.blocks?.flatMap(b => b.paragraphs.flatMap(p => p.lines)) ?? [];
  if (!lines.length) return extractPhones(data.text, data.confidence ?? 0);
  return lines.flatMap((line) => {
    const candidates = extractPhones(line.text, line.confidence ?? 0);
    return candidates.map(candidate => {
      const words = (line.words ?? []).filter((w) => /[0-9]/.test(w.text) && candidate.original.includes(w.text.trim()));
      const confidence = words.length ? Math.min(...words.map((w) => w.confidence)) : candidate.confidence;
      const box = words.length ? {x0:Math.min(...words.map(w=>w.bbox.x0)),y0:Math.min(...words.map(w=>w.bbox.y0)),x1:Math.max(...words.map(w=>w.bbox.x1)),y1:Math.max(...words.map(w=>w.bbox.y1))} : line.bbox;
      return { ...candidate, confidence, box };
    });
  });
}
export function reconcilePasses(passes: Candidate[][]): Candidate[] {
  const output: Candidate[] = [];
  for (const pass of passes) for (const c of pass) {
    const old = output.find(old => old.normalized===c.normalized && (old.box&&c.box ? Math.abs(old.box.y0-c.box.y0)<18 && Math.abs(old.box.x0-c.box.x0)<30 : old.line===c.line));
    if (old) { old.confidence=Math.min(old.confidence,c.confidence); continue; }
    const copy = { ...c }; output.push(copy);
  }
  // Different readings in the same line are never silently resolved.
  const resolved=supersedePartialReadings(output);
  for (const c of resolved) if (c.box && c.category !== 'rejected' && resolved.some(other => other !== c && other.box && other.category !== 'rejected' && other.normalized !== c.normalized && Math.abs(other.box.y0-c.box!.y0) < 18 && Math.abs(other.box.x0-c.box!.x0) < 30)) {
    c.category = 'review'; c.reason = 'OCR passes disagree — verify screenshot';
  }
  return resolved;
}
export function recoveryRegions(candidates:Candidate[],width:number,height:number){
 const regions:{left:number;top:number;width:number;height:number}[]=[];
 for(const c of candidates){if(!c.box||c.category==='rejected'||!/^04\d{0,7}$/.test(c.normalized))continue;
  const b=c.box;const lineHeight=Math.max(12,b.y1-b.y0);const left=Math.max(0,Math.floor(b.x0-16));const top=Math.max(0,Math.floor(b.y0-lineHeight*.4));
  const region={left,top,width:Math.min(width-left,Math.max(720,Math.ceil(b.x1-left+lineHeight*12))),height:Math.min(height-top,Math.ceil(lineHeight*1.8))};
  if(!regions.some(r=>Math.abs(r.left-left)<20&&Math.abs(r.top-top)<20))regions.push(region);
 }
 return regions;
}
export async function recognizeFile(file: File, worker: Awaited<ReturnType<typeof createWorker>>) {
  const passes: Candidate[][] = [];
  // Always run two full-image passes, even if the first finds a number.
  for (let variant = 0; variant < 3; variant++) {
    if (variant === 2 && passes.every(p => p.length && p.every(c => c.category !== 'review')) && passes[0].map(c=>c.normalized).sort().join() === passes[1].map(c=>c.normalized).sort().join()) break;
    let canvas:HTMLCanvasElement|null=null;
    try {
      canvas=await prepareImage(file,variant);
      await withTimeout(worker.setParameters({ tessedit_pageseg_mode: variant === 1 ? PSM.AUTO : PSM.SPARSE_TEXT }));
      const { data } = await withTimeout(worker.recognize(canvas, {}, { text: true, blocks: true }));
      const imageSize={width:canvas.width,height:canvas.height};
      passes.push(candidatesFromData(data).map(c=>({...c,imageSize})));
    } catch(error) {
      if(!passes.length)throw error;
      return reconcilePasses(passes).map(c=>c.category==='rejected'?c:{...c,category:'review' as const,reason:'Alternative OCR pass failed — verify screenshot'});
    } finally { if(canvas)canvas.width = canvas.height = 0; }
  }
  // Re-read incomplete phone lines in isolation at a larger text size.
  // The retained screenshot is never changed; only temporary canvases are used.
  const regions=recoveryRegions(passes.flat(),passes.flat().find(c=>c.imageSize)?.imageSize?.width??0,passes.flat().find(c=>c.imageSize)?.imageSize?.height??0);
  if(regions.length){let source:HTMLCanvasElement|null=null;
   try{source=await prepareImage(file,1);await withTimeout(worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE}));
    for(const region of regions){const crop=document.createElement('canvas');crop.width=region.width*2;crop.height=region.height*2;
     try{const ctx=crop.getContext('2d');if(!ctx)throw new Error('Could not prepare number region');ctx.drawImage(source,region.left,region.top,region.width,region.height,0,0,crop.width,crop.height);
      const {data}=await withTimeout(worker.recognize(crop,{}, {text:true,blocks:true}));passes.push(candidatesFromData(data).map(c=>({...c,imageSize:{width:source!.width,height:source!.height},box:c.box?{x0:c.box.x0/2+region.left,y0:c.box.y0/2+region.top,x1:c.box.x1/2+region.left,y1:c.box.y1/2+region.top}:undefined})));
     }catch{/* Keep earlier readings available for manual correction. */}finally{crop.width=crop.height=0}
    }
   }catch{/* Region recovery failure must not erase complete-image results. */}finally{if(source)source.width=source.height=0}
  }
  return reconcilePasses(passes);
}

