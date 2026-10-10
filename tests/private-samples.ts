// Optional local-only regression: pass an external JSON manifest with absolute
// paths and manually verified expected numbers. Never commit private samples.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createWorker,PSM} from 'tesseract.js';
import {candidatesFromData,reconcilePasses} from '../lib/ocr';
import {ocrDimensions} from '../lib/phone';
async function main(){const manifest=JSON.parse(fs.readFileSync(process.argv[2],'utf8')) as {path:string;expected:string[]}[];const worker=await createWorker('eng');try{for(const f of manifest){const meta=await sharp(f.path).metadata();const size=ocrDimensions(meta.width!,meta.height!);const passes=[];for(const psm of [PSM.SPARSE_TEXT,PSM.AUTO]){await worker.setParameters({tessedit_pageseg_mode:psm});const image=await sharp(f.path).resize(size.width,size.height).png().toBuffer();const {data}=await worker.recognize(image,{}, {text:true,blocks:true});passes.push(candidatesFromData(data))}const rows=reconcilePasses(passes);const actual=[...new Set(rows.filter(r=>r.category!=='rejected').map(r=>r.normalized))].sort();console.log(JSON.stringify({file:f.path.split('/').at(-1),expectedCount:f.expected.length,detectedCount:actual.length,categories:rows.map(r=>r.category)}));assert.ok(f.expected.every(n=>actual.includes(n)),'Every visible mobile must be detected');assert.ok(rows.filter(r=>!f.expected.includes(r.normalized)&&r.category!=='rejected').every(r=>r.category==='review'),'Unexpected readings must require review');assert.ok(rows.filter(r=>r.category==='valid').every(r=>f.expected.includes(r.normalized)))} }finally{await worker.terminate()}}
main().catch(e=>{console.error(e);process.exitCode=1});
