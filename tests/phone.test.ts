import assert from 'node:assert/strict';
import {test} from 'node:test';
import {classifyPhone,extractPhones,normalizePhone} from '../lib/phone';
import {reconcilePasses} from '../lib/ocr';
for(const n of [7,8,9,10,11,12]) test(`${n} digits`,()=>{assert.equal(classifyPhone('04'+'1'.repeat(n-2)).category,n===10?'valid':'review')});
for(const raw of ['0412345678','0412 345 678','0412-345-678','+61412345678','+61 412 345 678']) test(raw,()=>{assert.equal(classifyPhone(raw).category,'valid');assert.equal(normalizePhone(raw),'0412345678')});
test('reject landlines, dates, identifiers and prices',()=>{for(const raw of ['0212345678','0312345678','0712345678','0812345678','10/10/2026'])assert.equal(classifyPhone(raw).category,'rejected');assert.equal(extractPhones('ID: 0412345678')[0].category,'rejected');assert.equal(extractPhones('$0412345678')[0].category,'rejected')});
test('no trimming, guessing or joining lines',()=>{assert.equal(extractPhones('10412345678')[0].category,'review');assert.equal(extractPhones('04123456789')[0].category,'review');assert.equal(classifyPhone('0412 34O 678').category,'review');assert.equal(extractPhones('0412\n345678').length,1);assert.equal(extractPhones('0412\n345678')[0].original,'0412')});
test('names and multiple numbers',()=>{assert.equal(extractPhones('Alice 0412 345 678\nBob +61 422 111 222').filter(r=>r.category==='valid').length,2)});
test('uncertainty retained',()=>{assert.equal(extractPhones('0412345678',60)[0].category,'review');const a={...classifyPhone('0412345678'),box:{x0:10,y0:10,x1:200,y1:30}};const b={...classifyPhone('0412345679'),box:{x0:10,y0:10,x1:200,y1:30}};assert.ok(reconcilePasses([[a],[b]]).every(c=>c.category==='review'))});
test('normalised deduplication preserves different mobiles',()=>{assert.equal(new Set(['0412345678','+61412345678','0422345678'].map(normalizePhone)).size,2)});

test('adjacent table dates are rejected',()=>{assert.equal(extractPhones('09/11/2026 12/11/2026')[0].category,'rejected')});

test('wide spaces within formatted mobiles do not lose digits',()=>{assert.equal(extractPhones('0412  345  678')[0].normalized,'0412345678');assert.equal(extractPhones('0412  345  678')[0].category,'valid')});
test('matching high-confidence passes do not become review merely because confidence differs',()=>{const box={x0:10,y0:10,x1:200,y1:30};const a={...classifyPhone('0412345678',97),box};const b={...classifyPhone('0412345678',96),box};const out=reconcilePasses([[a],[b]]);assert.equal(out.length,1);assert.equal(out[0].category,'valid');assert.equal(out[0].confidence,96);assert.equal(reconcilePasses([[a],[{...b,confidence:70,category:'review',reason:'Low OCR confidence'}]])[0].category,'review')});
