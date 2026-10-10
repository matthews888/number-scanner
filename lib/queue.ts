// Queue identity is the upload index, never the filename (names may repeat).
export function pendingImages(total: number, completed: {imageIndex:number}[]) {
  const done=new Set(completed.map(r=>r.imageIndex));
  return Array.from({length:total},(_,i)=>i).filter(i=>!done.has(i));
}
