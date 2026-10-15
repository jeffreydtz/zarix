// Ejecuta PL/pgSQL real en una base PostgreSQL WASM aislada; no usa Supabase remoto.
// Instalar PGlite aparte y pasar ZARIX_PGLITE_MODULE si no es dependencia local.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.ZARIX_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const original = process.argv.includes('--original');
const source = await fs.readFile(path.join(root, original
  ? 'supabase/migrations/20260504105800_secondary_adjustment_no_primary_impact.sql'
  : 'supabase/migrations/20261007000231_preserve_transfer_destination_amount.sql'), 'utf8');
const ids = ['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
  '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d'];
await db.exec(`
 CREATE TABLE accounts(id UUID PRIMARY KEY, balance NUMERIC(20,8) NOT NULL,
   user_id UUID DEFAULT '11111111-1111-1111-1111-111111111111', currency TEXT DEFAULT 'ARS',
   type TEXT, is_multicurrency BOOLEAN DEFAULT FALSE, secondary_currency TEXT);
 CREATE TABLE transactions(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
   type TEXT, account_id UUID REFERENCES accounts(id), destination_account_id UUID REFERENCES accounts(id),
   amount NUMERIC(20,8), amount_in_account_currency NUMERIC(20,8), exchange_rate NUMERIC(20,8), currency TEXT,
   destination_amount_in_account_currency NUMERIC(20,8),
   user_id UUID DEFAULT '11111111-1111-1111-1111-111111111111', transaction_date TIMESTAMPTZ DEFAULT NOW());
 INSERT INTO accounts(id,balance,type,is_multicurrency,secondary_currency) VALUES
 ('${ids[0]}',10000,'bank',false,null), ('${ids[1]}',2000,'bank',false,null),
 ('${ids[2]}',3000,'bank',false,null), ('${ids[3]}',-10000,'credit_card',true,'USD');
 ${source}
 CREATE TRIGGER trigger_update_account_balance AFTER INSERT OR UPDATE OR DELETE ON transactions
 FOR EACH ROW EXECUTE FUNCTION update_account_balance();
`);
const insert = (type, amount, sourceId=0, destId=null, currency='ARS', ain=amount, rate=null, credit=null) =>
  `INSERT INTO transactions(type,account_id,destination_account_id,amount,amount_in_account_currency,currency,exchange_rate,destination_amount_in_account_currency)
   VALUES('${type}','${ids[sourceId]}',${destId==null?'NULL':`'${ids[destId]}'`},${amount},${ain},'${currency}',${rate??'NULL'},${credit??'NULL'});`;
const cases = [
 ['SQL-01 gasto INSERT', insert('expense',1500), [8500,2000,3000,-10000]],
 ['SQL-02 ingreso INSERT', insert('income',500), [10500,2000,3000,-10000]],
 ['SQL-03 transferencia INSERT', insert('transfer',1500,0,1), [8500,3500,3000,-10000]],
 ['SQL-04 UPDATE monto gasto', insert('expense',1500)+'UPDATE transactions SET amount=2000,amount_in_account_currency=2000;', [8000,2000,3000,-10000]],
 ['SQL-05 UPDATE cuenta gasto', insert('expense',1500)+`UPDATE transactions SET account_id='${ids[1]}';`, [10000,500,3000,-10000]],
 ['SQL-06 UPDATE tipo gasto a ingreso', insert('expense',1500)+"UPDATE transactions SET type='income';", [11500,2000,3000,-10000]],
 ['SQL-07 DELETE gasto', insert('expense',1500)+'DELETE FROM transactions;', [10000,2000,3000,-10000]],
 ['SQL-08 DELETE ingreso', insert('income',500)+'DELETE FROM transactions;', [10000,2000,3000,-10000]],
 ['SQL-09 UPDATE destino y monto transferencia', insert('transfer',1500,0,1)+`UPDATE transactions SET destination_account_id='${ids[2]}',amount=1000,amount_in_account_currency=1000;`, [9000,2000,4000,-10000]],
 ['SQL-10 UPDATE origen transferencia', insert('transfer',1500,0,1)+`UPDATE transactions SET account_id='${ids[2]}';`, [10000,3500,1500,-10000]],
 ['SQL-11 DELETE transferencia', insert('transfer',1500,0,1)+'DELETE FROM transactions;', [10000,2000,3000,-10000]],
 ['SQL-12 ajuste secundario INSERT UPDATE DELETE', insert('adjustment',10,3,null,'USD',10)+ 'UPDATE transactions SET amount=20,amount_in_account_currency=20;DELETE FROM transactions;', [10000,2000,3000,-10000]],
 ['SQL-13 ajuste secundario a primario', insert('adjustment',10,3,null,'USD',10)+"UPDATE transactions SET currency='ARS',amount=500,amount_in_account_currency=500;", [10000,2000,3000,-9500]],
 ['SQL-14 ingreso a transferencia', insert('income',500)+`UPDATE transactions SET type='transfer',destination_account_id='${ids[1]}';`, [9500,2500,3000,-10000]],
 ['SQL-15 transferencia a gasto', insert('transfer',1500,0,1)+"UPDATE transactions SET type='expense',destination_account_id=NULL;", [8500,2000,3000,-10000]],
 ['SQL-16 rollback transferencia', `BEGIN;${insert('transfer',1500,0,1)}ROLLBACK;`, [10000,2000,3000,-10000]],
 ['SQL-17 transferencia FX DELETE', insert('transfer',100,0,1,'USD',120000,1)+'DELETE FROM transactions;', [10000,2000,3000,-10000]],
 ['SQL-18 UPDATE tipo primario a ajuste secundario', insert('expense',500,3)+"UPDATE transactions SET type='adjustment',currency='USD',amount=10,amount_in_account_currency=10;", [10000,2000,3000,-10000]],
 ['SQL-19 ARS120000 a USD100 exactos', insert('transfer',120000,0,1,'ARS',120000,1/1200,100), [-110000,2100,3000,-10000]],
 ['SQL-20 importe grande conserva destino', insert('transfer',120000000,0,1,'ARS',120000000,1/1200,100000), [-119990000,102000,3000,-10000]],
 ['SQL-21 UPDATE importes destino confirmados', insert('transfer',120000,0,1,'ARS',120000,1/1200,100)+"UPDATE transactions SET amount=240000,amount_in_account_currency=240000,destination_amount_in_account_currency=200;", [-230000,2200,3000,-10000]],
 ['SQL-22 DELETE reversión destino exacto', insert('transfer',120000,0,1,'ARS',120000,1/1200,100)+'DELETE FROM transactions;', [10000,2000,3000,-10000]],
 ['SQL-23 USD100 a ARS120000 exactos', insert('transfer',100,1,0,'USD',100,1200,120000), [130000,1900,3000,-10000]],
 ['SQL-24 histórico sin destino explícito conserva fallback', insert('transfer',120000,0,1,'ARS',120000,1/1200), [-110000,2099.9996,3000,-10000]],
 ['SQL-25 UPDATE destino exacto a otra cuenta', insert('transfer',120000,0,1,'ARS',120000,1/1200,100)+`UPDATE transactions SET destination_account_id='${ids[2]}';`, [-110000,2000,3100,-10000]],
];
const results = [];
for (const [id, sql, expected] of cases) {
  await db.exec(`TRUNCATE transactions RESTART IDENTITY; UPDATE accounts SET balance=CASE id
    WHEN '${ids[0]}' THEN 10000 WHEN '${ids[1]}' THEN 2000 WHEN '${ids[2]}' THEN 3000 ELSE -10000 END;`);
  let obtained;
  try {
    await db.exec(sql);
    obtained = (await db.query('SELECT balance FROM accounts ORDER BY id')).rows.map(row=>Number(row.balance));
    assert.deepEqual(obtained, expected);
    results.push({ id, status:'PASS', expected, obtained });
  } catch (error) {
    results.push({ id, status:'FAIL', expected, obtained, error:error.message });
  }
}
if (!original) {
  // Comprueba el resumen bimoneda real, sin inferir crédito desde la tasa redondeada.
  await db.exec(`TRUNCATE transactions RESTART IDENTITY;
    UPDATE accounts SET currency='USD',secondary_currency='BTC',balance=0 WHERE id='${ids[3]}';
    ${insert('transfer',120000,0,3,'ARS',120000,1/1200,100)}`);
  for (const [id, sql, expected] of [
    ['SQL-26 resumen bimoneda crédito exacto', '', 100],
    ['SQL-27 resumen bimoneda UPDATE crédito exacto', 'UPDATE transactions SET amount=240000,amount_in_account_currency=240000,destination_amount_in_account_currency=200;', 200],
    ['SQL-28 resumen bimoneda DELETE revierte', 'DELETE FROM transactions;', 0],
  ]) {
    let obtained;
    try {
      if (sql) await db.exec(sql);
      obtained=Number((await db.query(`SELECT primary_balance FROM get_multicurrency_balances(
        '11111111-1111-1111-1111-111111111111', ARRAY['${ids[3]}']::UUID[])`)).rows[0].primary_balance);
      assert.equal(obtained,expected);
      results.push({ id,status:'PASS',expected,obtained });
    } catch (error) { results.push({ id,status:'FAIL',expected,obtained,error:error.message }); }
  }
}
const report={ date:new Date().toISOString(), engine:(await db.query('SELECT version() AS version')).rows[0].version,
  mode:original?'original':'revised', scope:'PL/pgSQL de update_account_balance; esquema mínimo aislado, no RLS/proveedores/concurrencia remota',
  passed:results.filter(x=>x.status==='PASS').length, total:results.length, results };
console.log(JSON.stringify(report,null,2));
await db.close();
if (report.passed!==report.total) process.exitCode=1;
