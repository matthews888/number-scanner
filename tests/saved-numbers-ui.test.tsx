import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { SavedNumber } from '../lib/history';
test('saved numbers bulk selection confirms, cancels, covers multiple pages and reports failures', async () => {
  const window = new Window({ url: 'http://localhost:3000' });
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator });
  const { render, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
  const { default: SavedNumbers } = await import('../app/components/SavedNumbers');
  const valid = Array.from({ length: 150 }, (_, i) => '04' + String(i).padStart(8, '0'));
  const items = [
    {
      id: 'scan',
      created_at: '',
      phone_numbers: [...valid, '048189768', '+495021192', '0212345678'],
    },
  ];
  let deleted: SavedNumber[] = [];
  let fail = false;
  let reviewed = '';
  let exported = false;
  const ui = render(
    <SavedNumbers
      items={items}
      busy={false}
      onReview={(value) => (reviewed = value)}
      onExport={() => (exported = true)}
      onDelete={async (rows) => {
        if (fail) throw new Error('Storage write failed');
        deleted = rows;
      }}
    />,
  );
  assert.ok(ui.getByRole('tab', { name: 'Valid mobiles (150)' }));
  assert.equal(ui.container.querySelectorAll('.savedRow').length, 100);
  fireEvent.click(ui.getByRole('checkbox', { name: 'Select all 150 valid mobiles' }));
  fireEvent.click(ui.getByRole('button', { name: 'Delete selected (150)' }));
  assert.ok(ui.getByRole('heading', { name: 'Delete 150 numbers?' }));
  assert.equal(deleted.length, 0);
  fireEvent.click(ui.getByRole('button', { name: 'Keep numbers' }));
  assert.ok(ui.queryByRole('dialog') === null);
  assert.equal(deleted.length, 0);
  fireEvent.click(ui.getByRole('button', { name: 'Delete selected (150)' }));
  fireEvent.click(ui.getByRole('button', { name: 'Confirm delete' }));
  await waitFor(() => assert.equal(deleted.length, 150));
  await waitFor(() => assert.ok(ui.queryByRole('dialog') === null));
  fireEvent.click(ui.getByRole('tab', { name: 'Missing digits (1)' }));
  assert.equal(ui.container.querySelectorAll('.savedRow').length, 1);
  fireEvent.click(ui.getByRole('button', { name: 'Review 048189768' }));
  assert.equal(reviewed, '048189768');
  fireEvent.click(ui.getByRole('checkbox', { name: 'Select 048189768' }));
  fireEvent.click(ui.getByRole('button', { name: 'Delete selected (1)' }));
  fail = true;
  fireEvent.click(ui.getByRole('button', { name: 'Confirm delete' }));
  await waitFor(() => assert.match(ui.getByRole('alert').textContent!, /Storage write failed/));
  assert.ok(ui.getByRole('dialog'));
  fail = false;
  fireEvent.click(ui.getByRole('button', { name: 'Confirm delete' }));
  await waitFor(() => assert.ok(ui.queryByRole('dialog') === null));
  assert.equal(deleted[0].number, '048189768');
  fireEvent.click(ui.getByRole('tab', { name: 'Other numbers (2)' }));
  assert.ok(ui.queryByRole('button', { name: 'Delete selected (1)' }) === null);
  fireEvent.click(ui.getByRole('checkbox', { name: 'Select all 2 other numbers' }));
  fireEvent.click(ui.getByRole('checkbox', { name: 'Select all 2 other numbers' }));
  assert.ok(ui.queryByRole('button', { name: 'Delete selected (2)' }) === null);
  fireEvent.click(ui.getByRole('button', { name: 'Download CSV' }));
  assert.equal(exported, true);
  assert.equal(ui.container.querySelector('details')?.hasAttribute('open'), false);
  fireEvent.click(ui.getByRole('button', { name: 'Delete all saved numbers' }));
  assert.ok(ui.getByRole('heading', { name: 'Delete 153 numbers?' }));
  fireEvent.click(ui.getByRole('button', { name: 'Keep numbers' }));
  cleanup();
});
