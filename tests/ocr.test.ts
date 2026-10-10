import assert from 'node:assert/strict';
import {test} from 'node:test';
import sharp from 'sharp';
import {createWorker,PSM} from 'tesseract.js';
import {candidatesFromData} from '../lib/ocr';
// Generated labelled fixtures are input images, never mocked OCR output.
const fixtures=[
 {name:'normal, names and dates',lines:['Alice 0412 345 678','10/10/2026','Bob +61 422 111 222'],expected:['0412345678','0422111222'],font:32},
 {name:'dark mode',lines:['0412-345-678'],expected:['0412345678'],font:32,dark:true},
 {name:'small text',lines:['Mobile 0412 345 678'],expected:['0412345678'],font:16},
 {name:'blurred',lines:['0412 345 678'],expected:['0412345678'],font:32,blur:.7},
 {name:'two mobiles on the same line',lines:['0412 345 678    0422 111 222'],expected:['0412345678','0422111222'],font:32},
 {name:'7 through 12 digits',lines:[7,8,9,10,11,12].map(n=>'041234567890'.slice(0,n)),expected:[7,8,9,10,11,12].map(n=>'041234567890'.slice(0,n)),font:24},
 {name:'repeated digit fragments stay reviewable',lines:[7,8,9,10,11,12].map(n=>'04'+'1'.repeat(n-2)),expected:[7,8,9,10,11,12].map(n=>'04'+'1'.repeat(n-2)),font:24,uncertain:true},
 {name:'no phone',lines:['Hello Alice','Meeting tomorrow'],expected:[],font:32}
];
test('real Tesseract OCR on eight fixture images',async()=>{
 const worker=await createWorker('eng');
 try{await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
 for(const f of fixtures){const svg=`<svg width="900" height="550"><rect width="100%" height="100%" fill="${f.dark?'#111':'white'}"/>${f.lines.map((t,i)=>`<text x="40" y="${70+i*80}" font-family="DejaVu Sans" font-size="${f.font}" fill="${f.dark?'white':'black'}">${t}</text>`).join('')}</svg>`;
 let pipeline=sharp(Buffer.from(svg));if(f.blur)pipeline=pipeline.blur(f.blur);const image=await pipeline.png().toBuffer();
 const {data}=await worker.recognize(image,{}, {text:true,blocks:true});
 const candidates=candidatesFromData(data);const actual=[...new Set(candidates.filter(c=>c.category!=='rejected').map(c=>c.normalized))].sort();
 console.log(JSON.stringify({fixture:f.name,text:data.text,candidates}));
 if('uncertain' in f&&f.uncertain){assert.ok(candidates.length>=f.lines.length,'Retain readable prefixes from every repeated-digit row');assert.ok(candidates.filter(c=>c.category==='valid').every(c=>f.expected.includes(c.normalized)),'Do not accept fabricated readings')}else assert.deepEqual(actual,f.expected.slice().sort(),f.name);
 }
 }finally{await worker.terminate()}
});
