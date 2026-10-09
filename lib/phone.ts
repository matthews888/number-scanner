// Horizontal separators only: numbers on separate lines must never be joined.
const PHONE_PATTERN = /\+?\d[\d\t ()./-]{5,}\d/g;

export function normalizePhone(value: string) {
  const cleaned = value.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
  return cleaned;
}

export function extractPhones(text: string) {
  const numbers = new Map<string, { normalized: string; original: string }>();
  for (const line of text.split(/\r?\n/)) {
    for (const match of line.match(PHONE_PATTERN) ?? []) {
      // Dates are not phone numbers, even when their digit count fits.
      if (/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(match.trim())) continue;
      // Recover complete Australian local numbers when OCR attaches a nearby
      // label digit. Keep international numbers intact.
      const local = !match.includes('+') && !match.trim().startsWith('00')
        ? match.match(/0[23478](?:[\t ()./-]*\d){8}(?!\d)/g)
        : null;
      for (const original of local ?? [match]) {
        const normalized = normalizePhone(original);
        const count = normalized.replace(/\D/g, '').length;
        if (count >= 7 && count <= 15) numbers.set(normalized, { normalized, original: original.trim() });
      }
    }
  }
  return [...numbers.values()];
}

// Bound memory on iPad while making small screenshot text large enough for OCR.
export function ocrDimensions(width: number, height: number) {
  const scale = Math.min(2, 4096 / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
