import { classifyPhone } from './phone';
export type HistoryItem = {
  id: string;
  phone_numbers: string[];
  created_at: string;
};
export function correctedHistory(items: HistoryItem[], original: string, value: string) {
  const candidate = classifyPhone(value);
  if (candidate.category !== 'valid')
    throw new Error(
      'Enter a complete Australian mobile: exactly 10 digits starting with 04, or a complete +61 mobile.',
    );
  const number = candidate.normalized;
  const duplicate = items.some((i) =>
    i.phone_numbers.some(
      (n) =>
        n !== original &&
        classifyPhone(n).category === 'valid' &&
        classifyPhone(n).normalized === number,
    ),
  );
  return {
    number,
    duplicate,
    items: items.map((i) => ({
      ...i,
      phone_numbers: [
        ...new Set(
          i.phone_numbers.map((n) =>
            n === original
              ? number
              : classifyPhone(n).category === 'valid'
                ? classifyPhone(n).normalized
                : n,
          ),
        ),
      ],
    })),
  };
}
export function historyValidNumbers(numbers: string[]) {
  return [
    ...new Set(
      numbers
        .map((n) => classifyPhone(n))
        .filter((n) => n.category === 'valid')
        .map((n) => n.normalized),
    ),
  ];
}
export type SavedNumber = {
  id: string;
  number: string;
  originals: string[];
  group: 'valid' | 'missing' | 'other';
};
export function savedNumberRows(items: HistoryItem[]): SavedNumber[] {
  const map = new Map<string, SavedNumber>();
  for (const original of items.flatMap((i) => i.phone_numbers)) {
    const candidate = classifyPhone(original);
    const group =
      candidate.category === 'valid'
        ? 'valid'
        : /^04/.test(candidate.normalized) && candidate.normalized.length < 10
          ? 'missing'
          : 'other';
    const number = group === 'valid' ? candidate.normalized : original;
    const id = group + ':' + number;
    const existing = map.get(id);
    if (existing) {
      if (!existing.originals.includes(original)) existing.originals.push(original);
    } else map.set(id, { id, number, originals: [original], group });
  }
  return [...map.values()];
}
export function historyDeletion(items: HistoryItem[], rows: SavedNumber[]) {
  const selected = new Set(rows.flatMap((r) => r.originals));
  return items
    .filter((i) => i.phone_numbers.some((n) => selected.has(n)))
    .map((i) => ({ ...i, phone_numbers: i.phone_numbers.filter((n) => !selected.has(n)) }));
}
// Commit each successful row independently so a later failure cannot erase
// unrelated history or claim that an uncompleted deletion succeeded.
export async function persistHistoryDeletion(
  items: HistoryItem[],
  rows: SavedNumber[],
  write: (row: HistoryItem) => Promise<void>,
  committed: (row: HistoryItem) => void,
) {
  for (const row of historyDeletion(items, rows)) {
    await write(row);
    committed(row);
  }
}
