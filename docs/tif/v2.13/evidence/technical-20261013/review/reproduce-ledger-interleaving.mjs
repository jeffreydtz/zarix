// Reproduces the old ledger read -> concurrent committed income -> stale update
// using real PostgreSQL triggers in a new PGlite fixture. No sockets/native targets.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../../../..');
const { bootDatabase, seedDatabase, asRole, ids } = await import(pathToFileURL(path.join(root, 'scripts/lib/test-isolated-database.mjs')).href);
const report = { startedAt: new Date().toISOString(), status: 'RUNNING',
  scope: 'Old service strategy interleaving represented by actual PostgreSQL SQL/triggers in an empty temporary PGlite fixture. Auth is synthetic; no UI/PostgREST/native multi-session assertion.',
  command: 'node docs/tif/v2.13/evidence/technical-20261013/review/reproduce-ledger-interleaving.mjs' };
const { db, manifest } = await bootDatabase();
try {
  report.sqlSourceManifest = manifest;
  report.reproducerSha256 = createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex');
  await seedDatabase(db);
  await asRole(db, 'service_role', null, tx => tx.query('UPDATE accounts SET balance=0 WHERE id=$1', [ids.accountA]));
  const income = amount => asRole(db, 'service_role', null, tx => tx.query(`INSERT INTO transactions
    (user_id,type,account_id,amount,currency,amount_in_account_currency,description)
    VALUES($1,'income',$2,$3,'ARS',$3,'Synthetic interleaving income') RETURNING id`, [ids.a, ids.accountA, amount]));
  const balance = async () => Number((await db.query('SELECT balance FROM accounts WHERE id=$1', [ids.accountA])).rows[0].balance);
  const ledgerSum = async () => Number((await db.query(`SELECT sum(amount_in_account_currency) AS amount
    FROM transactions WHERE user_id=$1 AND account_id=$2 AND type='income'`, [ids.a, ids.accountA])).rows[0].amount);
  await income(100);
  assert.equal(await balance(), 100);
  const staleRead = await ledgerSum();
  await income(50); // independent financial command commits and trigger updates balance
  const afterCommittedIncome = await balance();
  assert.equal(afterCommittedIncome, 150);
  await asRole(db, 'service_role', null, tx => tx.query('UPDATE accounts SET balance=$1 WHERE id=$2 AND user_id=$3', [staleRead, ids.accountA, ids.a]));
  const afterOldRepair = await balance(), committedLedger = await ledgerSum();
  assert.equal(afterOldRepair, 100);
  assert.equal(committedLedger, 150);
  assert.equal(Number((await db.query('SELECT count(*) AS count FROM transactions WHERE user_id=$1', [ids.a])).rows[0].count), 2);
  report.status = 'REPRODUCED_OLD_FAILURE';
  report.interleaving = { initial: 100, staleLedgerRead: staleRead, newIncome: 50,
    afterIncomeTrigger: afterCommittedIncome, afterOldRepair, committedLedger,
    lostBalanceEffect: committedLedger - afterOldRepair, committedRowsPreserved: 2 };
} finally {
  await db.close();
  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
}
