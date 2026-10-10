'use client';
import {useEffect,useState} from 'react';
import ReviewViewer from './ReviewViewer';
import {makeThumbnail,readImages,saveImage} from '../../lib/checkpoint';
import {classifyPhone} from '../../lib/phone';
import {ReviewItem,ScanImage,applyCorrection,markReviewed} from '../../lib/review';
export default function HistoryReview({number,numbers,user,onClose,onNavigate,onSave}:{number:string;numbers:string[];user:string;onClose:()=>void;onNavigate:(number:string)=>void;onSave:(value:string)=>Promise<void>}){
 const[images,setImages]=useState<ScanImage[]>([]);const[ready,setReady]=useState(false);const[error,setError]=useState('');
 useEffect(()=>{let alive=true;void readImages(user).then(rows=>{if(alive){setImages(rows);setReady(true)}}).catch(()=>{if(alive)setError('Could not open retained screenshot storage. Close other tabs and try again.')});return()=>{alive=false}},[user]);
 function itemFor(value:string):ReviewItem {
  const retained=images.flatMap(image=>image.results.map(finding=>({image,finding}))).find(({finding})=>finding.original===value||finding.corrected===value||(finding.category==='valid'&&finding.normalized===value));
  if(retained)return {id:value,...retained};
  const key=user+':history:'+encodeURIComponent(value);const candidate=classifyPhone(value);
  const image:ScanImage={key,user,batch:'legacy-history',source:'Original screenshot not saved with this older scan',index:0,signature:value,status:'complete',results:[{...candidate,id:key+':number',reviewState:'unresolved'}]};
  return {id:value,image,finding:image.results[0]};
 }
 if(error)return <div className="reviewOverlay" role="dialog"><section className="reviewDialog"><p role="alert">{error}</p><button onClick={onClose}>Close</button></section></div>;
 if(!ready)return <div className="reviewOverlay" role="dialog"><section className="reviewDialog"><p>Finding original screenshot…</p><button onClick={onClose}>Close</button></section></div>;
 const items=numbers.map(itemFor);const item=itemFor(number);
 async function persist(image:ScanImage){await saveImage(image);setImages(current=>[...current.filter(i=>i.key!==image.key),image])}
 return <ReviewViewer item={item} items={items} user={user} onClose={onClose} onNavigate={onNavigate} onAttach={async file=>{const image={...item.image,source:file.name};const thumbnail=await makeThumbnail(file);await saveImage(image,{key:image.key,user,blob:file,thumbnail});setImages(current=>[...current.filter(i=>i.key!==image.key),image])}} onSave={async(value,next)=>{
  const change=applyCorrection(item.image,item.finding!.id,value,images);
  await persist(change.image);
  await onSave(value);
  if(next){const index=numbers.indexOf(number);if(index<numbers.length-1)onNavigate(numbers[index+1])}
 }} onMark={async state=>{await persist(markReviewed(item.image,item.finding!.id,state));const index=numbers.indexOf(number);if(index<numbers.length-1)onNavigate(numbers[index+1]);else onClose()}}/>;
}
