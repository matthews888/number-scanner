export type Candidate = {
  normalized: string; original: string; category: 'valid' | 'review' | 'rejected';
  reason: string; confidence: number; line: string; imageSize?: {width:number;height:number}; box?: { x0: number; y0: number; x1: number; y1: number };
};
export function normalizePhone(value: string) {
  const digits = value.replace(/[^0-9]/g, '');
  return /^614\d{8}$/.test(digits) ? `0${digits.slice(2)}` : digits;
}
export function classifyPhone(original: string, confidence = 100, line = original): Candidate {
  const normalized = normalizePhone(original);
  const base = { normalized, original, confidence, line };
  if (/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}(?:\s+\d{1,4}[/-]\d{1,2}[/-]\d{1,4})*$/.test(original.trim()) || /(?:\$|\b(?:id|invoice|order|reference)\s*[:#]?\s*)$/i.test(line.slice(0, line.indexOf(original))))
    return { ...base, category: 'rejected', reason: 'Date, price or identifier' };
  if (/^0[2378]\d{8}$/.test(normalized) || /^61[2378]\d{8}$/.test(normalized))
    return { ...base, category: 'rejected', reason: 'Australian landline' };
  if (/[^\d\s+().-]/.test(original)) return { ...base, category: 'review', reason: 'Ambiguous OCR characters' };
  if (/\+/.test(original)&&!/^\+61/.test(original.trim()))return {...base,category:'review',reason:'Uncertain country code'};
  if (/^04\d{8}$/.test(normalized)) return { ...base, category: confidence < 85 ? 'review' : 'valid', reason: confidence < 85 ? 'Low OCR confidence' : 'Valid Australian mobile' };
  if (/^(?:04|\+?61\s*4)/.test(original.replace(/[().-]/g, '')) || /^04/.test(normalized))
    return { ...base, category: 'review', reason: normalized.length < 10 ? 'Missing digits' : normalized.length > 10 ? 'Extra digits' : 'Invalid mobile pattern' };
  return { ...base, category: 'review', reason: normalized.length < 10 ? 'Missing digits or mobile prefix' : normalized.length > 10 ? 'Extra digits or uncertain prefix' : 'Uncertain mobile prefix' };
}
// Never take a ten-digit substring from a longer sequence. Newlines and
// non-numeric labels form boundaries; spaces remain part of the candidate.
export function extractPhones(text: string, confidence = 100): Candidate[] {
  const results: Candidate[] = [];
  for (const line of text.split(/\r?\n/)) {
    const pattern = /\+?[0-9OIl|][0-9OIl|\t ().\/-]*[0-9OIl|]/g;
    for (const match of line.matchAll(pattern)) {
      const raw = match[0].trim();
      if ((raw.match(/[0-9OIl|]/g) ?? []).length < 7 && !/^[0O][4A]/.test(raw)) continue;
      const pieces: string[] = [];
      let remainder = raw;
      // Split only a complete sequence of explicitly prefixed, complete
      // mobiles separated by whitespace. Every character must be accounted for.
      while (remainder) {
        const phone = remainder.match(/^(?:04(?:[ .-]*\d){8}|\+?61[ .-]*4(?:[ .-]*\d){8})(?=\s+|$)/);
        if (!phone) break;
        pieces.push(phone[0]); remainder = remainder.slice(phone[0].length).trimStart();
      }
      if (!remainder && pieces.length > 1) results.push(...pieces.map(piece=>classifyPhone(piece,confidence,line)));
      else results.push(classifyPhone(raw, confidence, line));
    }
  }
  return results;
}
export function ocrDimensions(width: number, height: number) {
  const scale = Math.min(2, 3000 / Math.max(width, height), Math.sqrt(4500000 / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
