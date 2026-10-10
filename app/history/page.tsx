'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { downloadCSV } from '../../lib/download';
import { supabase } from '../../lib/supabase';
import {
  HistoryItem,
  SavedNumber,
  correctedHistory,
  historyValidNumbers,
  persistHistoryDeletion,
} from '../../lib/history';
import HistoryReview from '../components/HistoryReview';
import SavedNumbers from '../components/SavedNumbers';
export default function HistoryPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!data.session) {
          location.href = '/';
          return;
        }
        if (!active) return;
        setSession(data.session);
        const rows: HistoryItem[] = [];
        for (let offset = 0; ; offset += 500) {
          const result = await supabase
            .from('scan_history')
            .select('id,phone_numbers,created_at')
            .eq('user_id', data.session.user.id)
            .order('created_at', { ascending: false })
            .order('id')
            .range(offset, offset + 499);
          if (result.error) throw result.error;
          rows.push(...((result.data ?? []) as HistoryItem[]));
          if ((result.data?.length ?? 0) < 500) break;
        }
        if (active) {
          setItems(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setNotice('Could not load saved numbers. Refresh to try again.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const numbers = useMemo(() => [...new Set(items.flatMap((i) => i.phone_numbers))], [items]);
  async function removeNumbers(rows: SavedNumber[]) {
    if (!session || busy) throw new Error('Please wait and try again.');
    setBusy(true);
    setNotice('');
    try {
      await persistHistoryDeletion(
        items,
        rows,
        async (row) => {
          const query = row.phone_numbers.length
            ? supabase.from('scan_history').update({ phone_numbers: row.phone_numbers })
            : supabase.from('scan_history').delete();
          const { error } = await query.eq('id', row.id).eq('user_id', session.user.id);
          if (error)
            throw new Error(
              'Some numbers could not be deleted. Successful deletions were saved. Please retry.',
            );
        },
        (row) =>
          setItems((current) =>
            current.map((i) => (i.id === row.id ? row : i)).filter((i) => i.phone_numbers.length),
          ),
      );
      setNotice(`${rows.length} selected numbers deleted.`);
    } finally {
      setBusy(false);
    }
  }
  async function saveCorrection(value: string) {
    if (!selected || !session) return;
    const change = correctedHistory(items, selected, value);
    for (const row of change.items) {
      if (!items.find((i) => i.id === row.id)?.phone_numbers.includes(selected)) continue;
      const { error } = await supabase
        .from('scan_history')
        .update({ phone_numbers: row.phone_numbers })
        .eq('id', row.id)
        .eq('user_id', session.user.id);
      if (error) throw new Error('Could not save correction. Please retry.');
      setItems((current) => current.map((i) => (i.id === row.id ? row : i)));
    }
    setNotice(
      change.duplicate ? 'Correction saved. Duplicate exports only once.' : 'Correction saved.',
    );
    setSelected(null);
  }
  if (loading)
    return (
      <main className="historyPage">
        <div className="empty">Loading numbers…</div>
      </main>
    );
  return (
    <main className="historyPage">
      <a href="/" className="backLink">
        ← Scanner
      </a>
      {notice && <p role="status">{notice}</p>}
      <SavedNumbers
        items={items}
        busy={busy}
        onReview={setSelected}
        onDelete={removeNumbers}
        onExport={() =>
          downloadCSV(
            ['phone_number', ...historyValidNumbers(numbers)].join('\n'),
            'valid-australian-mobiles.csv',
          )
        }
      />
      {selected && session && (
        <HistoryReview
          number={selected}
          numbers={numbers}
          user={session.user.id}
          onClose={() => setSelected(null)}
          onNavigate={setSelected}
          onSave={saveCorrection}
        />
      )}
    </main>
  );
}
