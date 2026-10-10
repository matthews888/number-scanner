import {Candidate,classifyPhone,supersedePartialReadings} from './phone';
export type ReviewState='unresolved'|'skipped'|'corrected'|'duplicate'|'unreadable';
export type Finding=Candidate & {id:string;reviewState:ReviewState;corrected?:string;updatedAt?:string};
export type ScanImage={key:string;user:string;batch:string;source:string;index:number;signature:string;status:'queued'|'complete'|'empty'|'failed';results:Finding[];reviewState?:ReviewState;error?:string};
export type ReviewItem={id:string;image:ScanImage;finding?:Finding};
export const unresolved=(state?:ReviewState)=>!state||state==='unresolved'||state==='skipped';
export function validNumbers(images:ScanImage[]) {
 const numbers=new Set<string>();
 for(const image of images)for(const f of image.results){
  if(f.reviewState==='unreadable')continue;
  const value=f.corrected??(f.category==='valid'?f.normalized:'');
  if(value&&classifyPhone(value).category==='valid')numbers.add(value);
 }
 return [...numbers];
}
export function flaggedItems(images:ScanImage[],includeResolved=false):ReviewItem[]{return images.flatMap(image=>image.results.filter(f=>f.category==='review'&&(includeResolved||unresolved(f.reviewState))).map(finding=>({id:finding.id,image,finding})))}
export function missedItems(images:ScanImage[],includeResolved=false):ReviewItem[]{return images.filter(i=>(i.status==='empty'||i.status==='failed')&&(includeResolved||unresolved(i.reviewState))).map(image=>({id:image.key+':missed',image,finding:image.results.find(f=>f.id.includes(':manual:'))}))}
export function applyCorrection(image:ScanImage,itemId:string,value:string,images:ScanImage[]){
 const candidate=classifyPhone(value);
 if(candidate.category!=='valid')throw new Error('Enter exactly 10 digits starting with 04, or a complete +61 mobile. Do not guess missing digits.');
 const finding=image.results.find(f=>f.id===itemId);
 const otherImages=images.map(i=>i.key===image.key?{...i,results:i.results.filter(f=>f.id!==itemId)}:i);
 const duplicate=validNumbers(otherImages).includes(candidate.normalized);
 const state=duplicate?'duplicate':'corrected';
 const timestamp=new Date().toISOString();
 const results=finding?image.results.map(f=>f.id===itemId?{...f,corrected:candidate.normalized,reviewState:state as ReviewState,updatedAt:timestamp}:f):[...image.results,{...candidate,id:image.key+':manual:'+image.results.length,reviewState:state as ReviewState,corrected:candidate.normalized,updatedAt:timestamp}];
 return {image:{...image,results,reviewState:finding&&!finding.id.includes(':manual:')?image.reviewState:state as ReviewState},duplicate,number:candidate.normalized};
}
export function markReviewed(image:ScanImage,itemId:string,state:'skipped'|'unreadable'):ScanImage {
 const found=image.results.find(f=>f.id===itemId);
 return {...image,reviewState:found&&!found.id.includes(':manual:')?image.reviewState:state,results:image.results.map(f=>f.id===itemId?{...f,reviewState:state,updatedAt:new Date().toISOString()}:f)};
}
export function mergeRecognition(image:ScanImage,candidates:Candidate[],failed?:string):ScanImage {
 // Retries never erase previous OCR evidence or manual corrections.
 const results=[...image.results];
 for(const c of candidates){const index=results.findIndex(f=>f.original===c.original&&f.normalized===c.normalized&&JSON.stringify(f.box)===JSON.stringify(c.box));if(index<0)results.push({...c,id:image.key+':finding:'+results.length,reviewState:'unresolved'});else if(unresolved(results[index].reviewState)&&!results[index].corrected&&c.category==='valid')results[index]={...results[index],...c};}

 const resolved=supersedePartialReadings(results).map(f=>f.corrected||!unresolved(f.reviewState)?results.find(old=>old.id===f.id)!:f);
 return {...image,results:resolved,status:failed?'failed':results.some(f=>f.category!=='rejected')?'complete':'empty',error:failed};
}
const quote=(v:string)=>'"'+v.replace(/"/g,'""')+'"';
export const validCSV=(images:ScanImage[])=>['phone_number',...validNumbers(images)].join('\n');
export function reviewCSV(items:ReviewItem[]){return ['screenshot_id,source,extracted,reason,status',...items.map(i=>[i.image.key,i.image.source,i.finding?.original??'',i.finding?.reason??i.image.error??'No number detected',i.finding?.reviewState??i.image.reviewState??'unresolved'].map(quote).join(','))].join('\n')}
export function nextItem(items:ReviewItem[],id:string,delta:number){const index=items.findIndex(i=>i.id===id);return items[Math.max(0,Math.min(items.length-1,index+delta))]?.id??null}
