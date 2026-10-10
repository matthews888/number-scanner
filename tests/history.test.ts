import test from 'node:test';
import assert from 'node:assert/strict';
import {correctedHistory,historyValidNumbers} from '../lib/history';
const items=[{id:'old',created_at:'',phone_numbers:['048189768','0412345678','0212345678']},{id:'other',created_at:'',phone_numbers:['+61 412 345 678','048189768']}];
test('legacy correction replaces every saved occurrence and detects normalized duplicates',()=>{const result=correctedHistory(items,'048189768','+61 412 345 678');assert.equal(result.duplicate,true);assert.deepEqual(result.items.map(i=>i.phone_numbers),[['0412345678','0212345678'],['0412345678']]);assert.equal(items[0].phone_numbers[0],'048189768')});
test('legacy corrections never guess or trim digits',()=>{for(const n of ['0412345','04123456','041234567','04123456789','041234567890','0212345678','04I2345678'])assert.throws(()=>correctedHistory(items,'048189768',n));assert.equal(correctedHistory(items,'048189768','0481897682').number,'0481897682')});
test('history valid export excludes flagged and landlines and normalizes duplicates',()=>{assert.deepEqual(historyValidNumbers(items.flatMap(i=>i.phone_numbers)),['0412345678'])});
