import { describe, expect, it } from 'vitest';
import {
  confirmPreviewFromDraft,
  confirmRequestFromDraft,
  effectiveInboxItem,
  type InboxDraft,
} from '@/lib/pending-inbox-preview';

const ITEM: InboxDraft = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9',
  amount: 100,
  currency: 'ARS',
  merchant: 'COTO',
  card_name: 'Visa',
  account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  status: 'pending',
  direction: 'expense',
  created_at: '2026-10-24T20:00:00.000Z',
  tool_payload: {
    type: 'expense',
    amount: 999,
    account: 'Cuenta parked',
    accountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  },
};

const ACCOUNTS = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', name: 'Visa Ejemplo' },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', name: 'Otra' },
];

describe('pending inbox preview matches the confirm request', () => {
  it('builds preview and POST body from the same edited draft, not the parked payload', () => {
    const draft = effectiveInboxItem(ITEM, { amount: 250, account_id: ITEM.account_id });
    const preview = confirmPreviewFromDraft(draft, ACCOUNTS);
    const request = confirmRequestFromDraft(draft);
    expect(preview.amount).toBe(250);
    expect(preview.accountName).toBe('Visa Ejemplo');
    expect(preview.directionLabel).toBe('Gasto');
    expect(request.amount).toBe(250);
    expect(request.accountId).toBe(ITEM.account_id);
    expect(request.amount).toBe(preview.amount);
    expect(request.accountId).toBe(ITEM.account_id);
  });

  it('shows income before confirm', () => {
    const draft = effectiveInboxItem({ ...ITEM, direction: 'income', tool_payload: { type: 'income', amount: 100 } });
    expect(confirmPreviewFromDraft(draft, ACCOUNTS).directionLabel).toBe('Ingreso');
  });
});
