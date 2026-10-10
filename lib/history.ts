import {classifyPhone} from './phone';
export type HistoryItem={id:string;phone_numbers:string[];created_at:string};
export function correctedHistory(items:HistoryItem[],original:string,value:string){
 const candidate=classifyPhone(value);
 if(candidate.category!=='valid')throw new Error('Enter a complete Australian mobile: exactly 10 digits starting with 04, or a complete +61 mobile.');
 const number=candidate.normalized;
 const duplicate=items.some(i=>i.phone_numbers.some(n=>n!==original&&classifyPhone(n).category==='valid'&&classifyPhone(n).normalized===number));
 return {number,duplicate,items:items.map(i=>({...i,phone_numbers:[...new Set(i.phone_numbers.map(n=>n===original?number:classifyPhone(n).category==='valid'?classifyPhone(n).normalized:n))]}))};
}
export function historyValidNumbers(numbers:string[]){return [...new Set(numbers.map(n=>classifyPhone(n)).filter(n=>n.category==='valid').map(n=>n.normalized))]}
