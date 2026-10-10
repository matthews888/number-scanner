import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingImages} from '../lib/queue';
test('2,300 queue entries accounted for, failures do not lose successes',()=>{
 const reports:{imageIndex:number;status:string}[]=[];
 const successes=new Set<number>();
 for(const i of pendingImages(2300,reports)){
  // Controlled failures test queue bookkeeping, not OCR accuracy.
  const failed=i%100===0;
  reports.push({imageIndex:i,status:failed?'failed':'complete'});
  if(!failed)successes.add(i);
 }
 assert.equal(reports.length,2300);assert.equal(successes.size,2277);
 assert.equal(pendingImages(2300,reports).length,0);
 const successfulReports=reports.filter(r=>r.status!=='failed');
 const retry=pendingImages(2300,successfulReports);assert.equal(retry.length,23);
 assert.ok(retry.every(i=>!successes.has(i)));
});
test('resume does not rescan completed indexes; newly added images queue',()=>{assert.deepEqual(pendingImages(5,[{imageIndex:0},{imageIndex:2}]),[1,3,4])});
