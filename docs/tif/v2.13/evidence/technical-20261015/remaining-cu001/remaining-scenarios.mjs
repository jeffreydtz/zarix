// Prepared adapters only. Importing this module performs no I/O.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const date = '2026-10-06';
const countRule = (c, id) => Number(c.sql(`SELECT count(*) FROM transactions WHERE recurring_rule_id=${c.lit(id)}`));
const marker = (c, id) => c.sql(`SELECT COALESCE(last_executed_date::text,'NULL') FROM recurring_rules WHERE id=${c.lit(id)}`);
const outbox = (c, id) => Number(c.sql(`SELECT count(*) FROM notification_outbox WHERE user_id=${c.lit(c.user().id)} AND event_key=${c.lit(`recurring:${id}:${date}`)}`));
const accountName = (c, id) => c.report.fixtures.find(x => x.id === id).name;
const archive = async (c, id, user = c.user()) => { const r = await c.request('DELETE', `/api/accounts/${id}`, undefined, user); c.check('Archive only own new independent fixture204', r.status, 204); };
const csvCell = value => `"${String(value).replaceAll('"', '""')}"`;
const csv = (name, entries) => ['Fecha,Tipo,Monto,Moneda,Cuenta,Categoría,Descripción,Notas', ...entries.map(([type, amount, description]) => [date, type, amount, 'ARS', name, type === 'ingreso' ? 'Sueldo' : 'Alimentos', description, 'sintético'].map(csvCell).join(','))].join('\n');

async function importFile(c, { text, extension = 'csv', mode = 'import', skip = false, batchId = randomUUID(), name = `${c.current().id}.${extension}` }) {
  const folder = path.join(c.output, 'inputs'); await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const filename = `${c.current().id}-${randomUUID()}.${extension}`; await fs.writeFile(path.join(folder, filename), text, { mode: 0o600 });
  c.report.inputs ||= []; c.report.inputs.push({ caseId: c.current().id, file: `inputs/${filename}`, sha256: c.digest(text), batchId, mode, owner: c.user().id });
  const form = new FormData(); form.set('file', new File([text], name, { type: extension === 'json' ? 'application/json' : 'text/csv' }));
  form.set('mode', mode); form.set('batchId', batchId); form.set('ownerId', c.user().id); form.set('dateFormat', 'dmy'); form.set('skipDuplicates', String(skip)); form.set('resolutions', '{}');
  return { ...await c.request('POST', '/api/import/transactions', form), batchId };
}
async function invalidImport(c, { text, extension, own, foreign = null }) {
  const ids = [own, ...(foreign ? [foreign] : [])];
  const before = { accounts: c.accountRows(ids), ledger: c.ledgerRows(ids) };
  const r = await importFile(c, { text, extension });
  c.check('Invalid import rejects without confirming a write', r.status >= 400 && r.status < 600 || r.body.imported === 0, true);
  c.check('Invalid import leaves full account/ledger snapshots intact', { accounts: c.accountRows(ids), ledger: c.ledgerRows(ids) }, before);
  c.check('Invalid import creates no durable batch receipt', Number(c.sql(`SELECT count(*) FROM transaction_requests WHERE user_id=${c.lit(c.user().id)} AND request_id LIKE ${c.lit(`import:${r.batchId}:%`)}`)), 0);
  c.observe('Invalid import response', { status: r.status, responseKeys: Object.keys(r.body).sort(), imported: r.body.imported ?? null });
  if (foreign) c.check('Foreign account is not disclosed as a selectable account', !(r.body.accounts || []).some(x => x.id === foreign), true);
}
async function cronFixture(c, { amount = 1000, balance = 10000, notification = false, activeFlag = true, end = date } = {}) {
  const account = await c.account(balance), rule = await c.rule(account, { amount, notification, activeFlag, end });
  return { account, rule };
}

export async function runScenarios(c) {
  await c.exact('CP1-04', async () => {
    c.slots(c.user(), 2); const a = await c.account(10000), b = await c.account(2000);
    const hook = await c.fault({ table: 'accounts', predicate: `NEW.id=${c.lit(b)}::uuid AND NEW.balance<>OLD.balance` });
    const payload = { type: 'transfer', accountId: a, destinationAccountId: b, amount: 1500, currency: 'ARS', transactionDate: `${date}T12:00:00Z`, description: `CP1-04 ${c.run}` }, key = randomUUID();
    const failed = await c.request('POST', '/api/transactions', payload, c.user(), key);
    c.check('Injected destination-impact failure returns error', failed.status >= 400, true);
    c.check('Destination failure hook was reached once', hook.hits(), { last_value: 1, is_called: true });
    c.check('Both balances and economic rows rolled back', { balances: [c.balance(a), c.balance(b)], economicRows: c.movements([a, b]).length }, { balances: [10000, 2000], economicRows: 0 });
    c.check('Failed financial request did not leave a committed receipt', Number(c.sql(`SELECT count(*) FROM transaction_requests WHERE user_id=${c.lit(c.user().id)} AND request_id=${c.lit(key)}`)), 0);
    await hook.remove(); const retry = await c.request('POST', '/api/transactions', payload, c.user(), key);
    c.check('Same durable key succeeds after removing only the own fault201', retry.status, 201);
    c.check('Retry commits once and conserves12000', { balances: [c.balance(a), c.balance(b)], economicRows: c.movements([a, b]).length, receipts: Number(c.sql(`SELECT count(*) FROM transaction_requests WHERE user_id=${c.lit(c.user().id)} AND request_id=${c.lit(key)}`)) }, { balances: [8500, 3500], economicRows: 1, receipts: 1 });
    c.observe('Failure point', { scope: hook.scope, point: 'BEFORE UPDATE of own destination account inside real transfer INSERT transaction; not a simulated provider or COMMIT/network failure' });
  });

  await c.exact('CP1-12', async () => {
    const a = await c.account(-10000, c.user(), { type: 'credit_card', isDebt: true, isMulticurrency: true, secondaryCurrency: 'USD' });
    const initial = await c.request('POST', `/api/accounts/${a}/adjust-secondary-balance`, { targetSecondaryBalance: -100 }); c.check('Initial own USD debt setup200', initial.status, 200);
    const before = c.ledgerRows([a]); const r = await c.request('POST', `/api/accounts/${a}/adjust-secondary-balance`, { targetSecondaryBalance: -90 }); c.check('SignedUSD delta+10 accepted200', r.status, 200);
    const result = c.rows(`SELECT primary_balance::text,secondary_balance::text FROM public.get_multicurrency_balances(${c.lit(c.user().id)}::uuid,ARRAY[${c.lit(a)}::uuid])`)[0];
    c.check('Secondary currency changes independently of primary debt', { primary: Number(result.primary_balance), secondary: Number(result.secondary_balance), physicalPrimary: c.balance(a) }, { primary: -10000, secondary: -90, physicalPrimary: -10000 });
    const added = c.ledgerRows([a]).filter(row => !before.some(old => old.id === row.id));
    c.check('Exactly one signed currency-identified audit row', added.map(x => ({ type: x.type, currency: x.currency, amount: Number(x.amount), signed: Number(x.amount_in_account_currency) })), [{ type: 'adjustment', currency: 'USD', amount: 10, signed: 10 }]);
    c.observe('Existing API representation', { endpoint: 'adjust-secondary-balance', input: 'absolute target-90', independentlyObservedDelta: 10, schemaAdaptation: 'CSV permits adapting ledger representation; no new field or validation introduced.' });
  });

  for (const id of ['CP1-19', 'CP1-20']) await c.exact(id, async () => {
    const a = await c.account(10000); const name = accountName(c, a), entries = [['gasto', 500, `${id} expense ${c.run}`], ['ingreso', 700, `${id} income ${c.run}`], ['gasto', 0, `${id} zero ${c.run}`]];
    const extension = id === 'CP1-19' ? 'csv' : 'json';
    const text = extension === 'csv' ? csv(name, entries) : JSON.stringify(entries.map(([type, amount, description]) => ({ date, type: type === 'gasto' ? 'expense' : 'income', amount, currency: 'ARS', account: name, category: type === 'gasto' ? 'Alimentos' : 'Sueldo', description, notes: 'sintético' })));
    const r = await importFile(c, { text, extension }); c.check('Partial valid local import200', r.status, 200);
    c.check('Exactly two economic writes and balance10200', { rows: c.movements([a]).length, balance: c.balance(a), amounts: c.movements([a]).map(x => Number(x.amount)).sort((x, y) => x - y) }, { rows: 2, balance: 10200, amounts: [500, 700] });
    c.check('Raw current importer counters', { imported: r.body.imported, skipped: r.body.skipped, pending: r.body.pending, total: r.body.total }, { imported: 2, skipped: 1, pending: 0, total: 3 });
    c.check('Exactly one documented invalid-amount rejection detail',r.body.skippedDetails?.map(x=>x.title),['Fila omitida — monto inválido']);
    c.observe('Literal classification versus current response schema', { literal: { imported: 2, rejected: 1, omittedDuplicates: 0, total: 3 }, observedRaw: { imported: r.body.imported, skipped: r.body.skipped, pending: r.body.pending, total: r.body.total }, skipTitles: r.body.skippedDetails?.map(x => x.title) || [] });
    c.observe('Explicit reviewed semantic adapter',{review:'cp1-19-semantic-review.json',reviewSha256:'72a4f1cc27dbd7b64054876a4a65a59b2505af8ca6a768242306ccc32600a355',parentDecision:'Applied to CP1-20 only after actual HTTP200/two writes/one invalid detail/no pending/total3/balance10200, all asserted above.',closedPartition:{validImports:2,invalidAmountRejections:1,otherOmissionsIncludingDuplicates:0,unconfirmed:0,total:3},notApiProperties:['invalidAmountRejections','otherOmissionsIncludingDuplicates'],duplicateOmissionSelected:false});
  });

  await c.exact('CP1-21', async () => {
    const a = await c.account(10000), text = csv(accountName(c, a), [['gasto', 500, `CP1-21 duplicate ${c.run}`]]);
    const initial = await importFile(c, { text }); c.check('Known existing500 expense imported once', { status: initial.status, imported: initial.body.imported, balance: c.balance(a) }, { status: 200, imported: 1, balance: 9500 });
    const tuple = c.rows(`SELECT type,transaction_date,account_id,destination_account_id,amount::text,currency,amount_in_account_currency::text,destination_amount_in_account_currency::text,category_id,description,notes FROM transactions WHERE account_id=${c.lit(a)} AND type='expense'`);
    c.check('Exactly one known duplicate-comparison tuple exists', tuple.length, 1); c.observe('Known synthetic comparison fingerprint', { sha256: c.digest(JSON.stringify(tuple[0])), criteria: Object.keys(tuple[0]).sort(), schemaNote: 'No nonexistent import_fingerprint column is assumed; current SQL compares this economic tuple.' });
    const preview = await importFile(c, { text, mode: 'preview' }); c.check('Same-file local preview200', preview.status, 200);
    const before = c.ledgerRows([a]), omitted = await importFile(c, { text, skip: true });
    c.check('Choosing omit creates no new write', { status: omitted.status, imported: omitted.body.imported, skipped: omitted.body.skipped, pending: omitted.body.pending, total: omitted.body.total, balance: c.balance(a) }, { status: 200, imported: 0, skipped: 1, pending: 0, total: 1, balance: 9500 });
    c.check('Duplicate omission leaves exact full ledger', c.ledgerRows([a]), before);
    c.observe('Duplicate criteria available in actual response', { skipTitles: omitted.body.skippedDetails?.map(x => x.title) || [], skipReasons: omitted.body.skippedDetails?.map(x => x.reason) || [] });
    c.pending('Visible duplicate criteria UI', 'API preview/omit choice and SQL invariance are real; actual Arc review screen has not been executed.');
  });

  await c.exact('CP1-22', async () => {
    const a = await c.account(10000); await invalidImport(c, { own: a, text: csv(accountName(c, a), [['gasto', '', `CP1-22 missing amount ${c.run}`]]), extension: 'csv' }); await archive(c, a);
    const aa = await c.account(10000), foreign = await c.account(10000, c.other());
    const foreignText = csv(accountName(c, foreign), [['gasto', 500, `CP1-22 foreign ${c.run}`]]);
    const preview = await importFile(c, { text: foreignText, mode: 'preview' }); c.check('Foreign-name file preview200', preview.status, 200); c.check('Actual preview returns an account array', Array.isArray(preview.body.accounts), true); c.check('Foreign account and balance absent from actual selectable preview', preview.body.accounts.every(x => x.id !== foreign && !Object.hasOwn(x, 'balance')), true);
    await invalidImport(c, { own: aa, foreign, text: foreignText, extension: 'csv' }); await archive(c, aa); await archive(c, foreign, c.other());
    const aaa = await c.account(10000); await invalidImport(c, { own: aaa, text: '[{"date":"2026-10-06","amount":500', extension: 'json' });
  });

  await c.exact('CP1-23', async () => {
    await c.clock(); const a = await c.account(10000), cat = await c.category('Alimentos', 'expense'), before = c.ledgerRows([a]);
    const made = await c.request('POST', '/api/recurring', { accountId: a, type: 'expense', amount: 1000, currency: 'ARS', categoryId: cat, frequency: 'daily', startDate: '2026-10-01', endDate: date, description: `CP1-23 ${c.run}`, notificationEnabled: false }); c.check('Create own literal rule201', made.status, 201); const id = made.body.id, actor = c.user();
    c.registerCleanup(async () => { const r = await c.request('PUT', `/api/recurring/${id}`, { isActive: false }, actor); assert.equal(r.status, 200); });
    for (const [label, patch, active] of [['suspend', { isActive: false }, false], ['reactivate', { isActive: true }, true], ['edit', { amount: 1200 }, true]]) {
      const r = await c.request('PUT', `/api/recurring/${id}`, patch); c.check(`Rule ${label} has own state and inclusive end`, { status: r.status, owner: r.body.user_id, active: r.body.is_active, end: r.body.end_date, amount: Number(r.body.amount) }, { status: 200, owner: c.user().id, active, end: date, amount: label === 'edit' ? 1200 : 1000 });
    }
    c.check('Saving/suspending/reactivating/editing never creates a movement', c.ledgerRows([a]), before);
    c.pending('Next occurrence presentation', 'No nonexistent API next-date field is invented. Actual recurring UI next-occurrence rendering is unexecuted; inclusive-date execution is tested separately by real cron cases.');
  });

  await c.exact('CP1-24', async () => {
    const f = await cronFixture(c, { notification: true }); const calls = await Promise.all([c.cron(), c.cron()]); const retry = await c.cron();
    c.check('Two concurrent cron calls and same-day retry200', [...calls, retry].map(x => x.status), [200, 200, 200]);
    c.check('Exactly one recurring occurrence/marker/outbox and debit', { occurrences: countRule(c, f.rule), balance: c.balance(f.account), marker: marker(c, f.rule), outbox: outbox(c, f.rule) }, { occurrences: 1, balance: 9000, marker: date, outbox: 1 });
    c.observe('Observed cron counters', { responses: [...calls, retry].map(x => x.body) });
    if (!c.current().premiumFixture.chatLinked) c.pending('Linked Telegram fixture precondition', 'No linked bot credential/chat was created. Financial occurrence and outbox are real; no bot identity or provider delivery acceptance is claimed.');
  });

  await c.exact('CP1-25', async () => {
    const f = await cronFixture(c, { notification: true }); const hook = await c.fault({ table: 'transactions', predicate: `NEW.recurring_rule_id=${c.lit(f.rule)}::uuid` });
    const failed = await c.cron(); c.check('Before-insert fault is counted as one item error', { status: failed.status, errors: failed.body.errors }, { status: 200, errors: 1 });
    c.check('Own failure point reached once', hook.hits(), { last_value: 1, is_called: true });
    c.check('Insert/marker/outbox all roll back', { count: countRule(c, f.rule), balance: c.balance(f.account), marker: marker(c, f.rule), outbox: outbox(c, f.rule) }, { count: 0, balance: 10000, marker: '2026-10-05', outbox: 0 });
    await hook.remove(); const retry = await c.cron(); c.check('Real cron retry200', retry.status, 200);
    c.check('Retry commits once after rollback', { count: countRule(c, f.rule), balance: c.balance(f.account), marker: marker(c, f.rule), outbox: outbox(c, f.rule) }, { count: 1, balance: 9000, marker: date, outbox: 1 });
    c.pending('Committed INSERT/unmarked23505 branch', 'Current INSERT trigger atomically marks the date/outbox; durable receipts can bypass a later INSERT. This rollback test does not manufacture a committed-unmarked branch by weakening atomicity or deleting receipts. See cron-contract-review.json.');
  });

  await c.exact('CP1-28', async () => {
    const a = await c.account(10000), before = c.ledgerRows([a]), invalid = await c.cron(true); c.check('Invalid Bearer401', invalid.status, 401); c.check('Invalid Bearer no financial effect', c.ledgerRows([a]), before);
    const inactive = await c.rule(a, { activeFlag: false }); const skipped = await c.cron(); c.check('Inactive rule skips without movement', { status: skipped.status, occurrences: countRule(c, inactive), balance: c.balance(a) }, { status: 200, occurrences: 0, balance: 10000 });
    const expired = await c.rule(a, { end: '2026-10-05' }); const expiration = await c.cron(); c.check('Expired rule deactivates without movement', { status: expiration.status, active: c.rows(`SELECT is_active FROM recurring_rules WHERE id=${c.lit(expired)}`)[0].is_active, count: countRule(c, expired), balance: c.balance(a) }, { status: 200, active: false, count: 0, balance: 10000 });
    c.pending('Observed pre-DB call ordering', 'Runtime401 and immutable ledger are observed. Guard-before-client construction is source evidence; no server DB-call counter was instrumented, so before-DB observation is not invented.');
  });

  for (const id of ['CP1-29', 'CP1-30']) await c.exact(id, async () => {
    const notification = id === 'CP1-30', f = await cronFixture(c, { balance: 500, notification }); const r = await c.cron();
    c.check('Negative balance is allowed by the documented rule', { status: r.status, count: countRule(c, f.rule), balance: c.balance(f.account), marker: marker(c, f.rule) }, { status: 200, count: 1, balance: -500, marker: date });
    if (notification) { c.check('One durable notification intention', outbox(c, f.rule), 1); c.pending('Real Telegram acceptance', 'No authorized bot credential exists and no delivery attempt is made. The real financial operation/outbox are separate from provider delivery; no invented overdraft warning.'); }
  });

  await c.exact('CP1-31', async () => {
    for (const spent of [9999.99, 10000, 10000.01]) {
      c.slots(c.user(), 2); const a = await c.account(20000), b = await c.account(0), cat = await c.newCategory('Alimentos');
      const budget = await c.request('POST', '/api/budgets', { categoryId: cat, month: '2026-10', amount: 10000, currency: 'ARS' }); c.check('Independent literal budget201', budget.status, 201); const actor = c.user(), budgetId = budget.body.id;
      c.registerCleanup(async () => { const r = await c.request('DELETE', `/api/budgets/${budgetId}`, undefined, actor); assert.ok([200, 204].includes(r.status)); });
      await c.transaction(a, spent, 'expense', { categoryId: cat }); const status = await c.request('GET', '/api/budgets/status?month=2026-10-01'); c.check('Real budget-status API200', status.status, 200); const value = status.body.find(x => x.category_id === cat);
      const remaining = Math.round((10000 - spent) * 100) / 100; c.check('Exact independent consumed and remaining cents', { spent: Number(value.spent_amount), remaining: Number(value.remaining_amount) }, { spent, remaining });
      await c.transaction(a, 500, 'transfer', { categoryId: cat, destinationAccountId: b }); const after = await c.request('GET', '/api/budgets/status?month=2026-10-01'); c.check('Transfer does not consume or block the budget', { status: after.status, spent: Number(after.body.find(x => x.category_id === cat).spent_amount), remaining: Number(after.body.find(x => x.category_id === cat).remaining_amount), destination: c.balance(b) }, { status: 200, spent, remaining, destination: 500 });
      c.observe('State derived from real remaining amount', { fixtureSpent: spent, remaining, derivedState: remaining > 0 ? 'disponible' : remaining === 0 ? 'límite' : 'superado', actualUiStateSeen: false }); await archive(c, a); await archive(c, b);
    }
    c.pending('Visible budget state', 'Numeric boundaries, nonblocking operation and transfer exclusion are real API/SQL. UI state labels have not been executed in Arc.');
  });

  await c.exact('CP1-35', async () => {
    const empty = await c.cron(); c.check('Independent empty batch exact counters', { status: empty.status, total: empty.body.total, processed: empty.body.processed, errors: empty.body.errors }, { status: 200, total: 0, processed: 0, errors: 0 });
    c.slots(c.user(), 3); const good = await cronFixture(c), inactive = await cronFixture(c, { activeFlag: false }), bad = await cronFixture(c);
    const hook = await c.fault({ table: 'transactions', predicate: `NEW.recurring_rule_id=${c.lit(bad.rule)}::uuid` }); const mixed = await c.cron();
    c.check('Mixed batch counts only successful and failed active items', { status: mixed.status, processed: mixed.body.processed, errors: mixed.body.errors }, { status: 200, processed: 1, errors: 1 });
    c.check('Persisted mixed outcomes independently reconcile', { good: countRule(c, good.rule), inactive: countRule(c, inactive.rule), bad: countRule(c, bad.rule), goodBalance: c.balance(good.account), inactiveBalance: c.balance(inactive.account), badBalance: c.balance(bad.account) }, { good: 1, inactive: 0, bad: 0, goodBalance: 9000, inactiveBalance: 10000, badBalance: 10000 });
    c.check('Current summary does not invent a skipped field', Object.hasOwn(mixed.body, 'skipped'), false); c.observe('Observed current batch summary', { summary: mixed.body, omissionReconstruction: 'Inactive rule is absent from active fetch; total is observed, not assumed to count all three.' }); await hook.remove();
  });
}
