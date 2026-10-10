'use client';
import { useMemo, useState } from 'react';
import { HistoryItem, SavedNumber, savedNumberRows } from '../../lib/history';
export default function SavedNumbers({
  items,
  busy,
  onReview,
  onDelete,
  onExport,
}: {
  items: HistoryItem[];
  busy: boolean;
  onReview: (number: string) => void;
  onDelete: (rows: SavedNumber[]) => Promise<void>;
  onExport: () => void;
}) {
  const rows = useMemo(() => savedNumberRows(items), [items]);
  const [tab, setTab] = useState<'valid' | 'missing' | 'other'>('valid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [confirmation, setConfirmation] = useState<SavedNumber[] | null>(null);
  const [error, setError] = useState('');
  const filtered = rows.filter((r) => r.group === tab);
  const chosen = rows.filter((r) => selected.has(r.id));
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      for (const r of filtered)
        if (allSelected) next.delete(r.id);
        else next.add(r.id);
      return next;
    });
  }
  async function remove() {
    if (!confirmation) return;
    setError('');
    try {
      await onDelete(confirmation);
      setSelected(new Set());
      setConfirmation(null);
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete numbers. Please retry.');
    }
  }
  return (
    <section className="savedNumbers">
      <div className="savedNumbersHeading">
        <h1>Saved numbers</h1>
        <button
          className="primary"
          disabled={busy || !rows.some((r) => r.group === 'valid')}
          onClick={onExport}
        >
          Download CSV
        </button>
      </div>
      <p className="savedHint">Tap a number to review it, or tick numbers to delete them.</p>
      <div className="actions" role="tablist" aria-label="Saved numbers">
        {(
          [
            ['valid', 'Valid mobiles'],
            ['missing', 'Missing digits'],
            ['other', 'Other numbers'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            className="secondary"
            disabled={busy}
            onClick={() => {
              setTab(value);
              setPage(0);
              setSelected(new Set());
            }}
          >
            {label} ({rows.filter((r) => r.group === value).length})
          </button>
        ))}
      </div>
      <div className="bulkToolbar">
        <label>
          <input
            type="checkbox"
            aria-label={`Select all ${filtered.length} ${tab === 'valid' ? 'valid mobiles' : tab === 'missing' ? 'missing digit numbers' : 'other numbers'}`}
            checked={allSelected}
            disabled={busy || !filtered.length}
            onChange={toggleAll}
          />
          Select all ({filtered.length})
        </label>
        {chosen.length > 0 && (
          <>
            <span>{chosen.length} selected</span>
            <button
              className="deleteButton"
              disabled={busy}
              onClick={() => {
                setError('');
                setConfirmation(chosen);
              }}
            >
              Delete selected ({chosen.length})
            </button>
            <button className="secondary" disabled={busy} onClick={() => setSelected(new Set())}>
              Cancel selection
            </button>
          </>
        )}
      </div>
      <div className="savedList">
        {filtered.slice(page * 100, (page + 1) * 100).map((row) => (
          <div className="savedRow" key={row.id}>
            <label className="numberCheckbox">
              <input
                type="checkbox"
                aria-label={`Select ${row.number}`}
                checked={selected.has(row.id)}
                disabled={busy}
                onChange={() => toggle(row.id)}
              />
            </label>
            <button
              className="savedNumberLink"
              aria-label={`Review ${row.number}`}
              disabled={busy}
              onClick={() => onReview(row.originals[0])}
            >
              {row.number}
            </button>
            {tab === 'missing' && <span className="savedHint">Missing digits</span>}
          </div>
        ))}
        {!filtered.length && (
          <p className="empty">
            No{' '}
            {tab === 'valid'
              ? 'valid mobiles'
              : tab === 'missing'
                ? 'numbers with missing digits'
                : 'other numbers'}
            .
          </p>
        )}
      </div>
      {filtered.length > 100 && (
        <div className="actions">
          <button
            className="secondary"
            disabled={busy || page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous page
          </button>
          <span>
            {page * 100 + 1}–{Math.min((page + 1) * 100, filtered.length)} of {filtered.length}
          </span>
          <button
            className="secondary"
            disabled={busy || (page + 1) * 100 >= filtered.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next page
          </button>
        </div>
      )}
      <details className="scanOptions">
        <summary>More options</summary>
        <button
          className="deleteButton"
          disabled={busy || !rows.length}
          onClick={() => {
            setError('');
            setConfirmation(rows);
          }}
        >
          Delete all saved numbers
        </button>
      </details>
      {confirmation && (
        <div
          className="reviewOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deleteNumbersTitle"
        >
          <section className="deleteNumbersDialog">
            <h2 id="deleteNumbersTitle">
              Delete {confirmation.length} number{confirmation.length === 1 ? '' : 's'}?
            </h2>
            <p>This removes them from your saved history. It cannot be undone.</p>
            {error && (
              <p role="alert" className="reviewError">
                {error}
              </p>
            )}
            <div className="actions">
              <button
                className="secondary"
                autoFocus
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Keep numbers
              </button>
              <button className="deleteButton" disabled={busy} onClick={() => void remove()}>
                {busy ? 'Deleting…' : 'Confirm delete'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
