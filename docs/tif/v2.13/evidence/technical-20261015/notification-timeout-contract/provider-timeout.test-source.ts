import { expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { asRole, bootstrapSources, ids, platformSql, seedDatabase } from '../../../../../../scripts/lib/test-isolated-database.mjs';
const provider = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/telegram/send', () => ({ sendTelegramDm: provider.send }));
import { deliverNotificationOutbox } from '@/lib/services/notification-outbox';

// PGlite executes actual bootstrap/migrations and durable RPCs. This bounded
// query adapter substitutes PostgREST; roles/Auth are synthetic, Telegram a double.
let db: PGlite;
const ruleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccc27';
const requestId = `recurring:${ruleId}:2026-10-06`;
const fingerprint = 'a'.repeat(64);
const movement = { user_id: ids.a, type: 'expense', account_id: ids.accountA,
  amount: 1000, currency: 'ARS', amount_in_account_currency: 1000,
  transaction_date: '2026-10-06T12:00:00Z', is_recurring: true,
  recurring_rule_id: ruleId, description: 'CP1-27 aviso sintético' };
const output = fileURLToPath(new URL('./verification.json', import.meta.url));
const assertions: Array<{ name: string; actual: unknown; expected: unknown; status: string }> = [];
function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  assertions.push({ name, actual, expected, status: pass ? 'PASS' : 'FAIL' });
  expect(actual, name).toEqual(expected);
}
async function createOccurrence() {
  return asRole(db, 'service_role', null, async (tx: Transaction) =>
    (await tx.query<{ receipt: { id: string } }>('SELECT create_transaction_once($1,$2,$3,$4,1) AS receipt',
      [ids.a, requestId, fingerprint, JSON.stringify(movement)])).rows[0].receipt);
}
async function financial() {
  return (await db.query<{ value: any }>(`SELECT jsonb_build_object(
    'account',(SELECT to_jsonb(a) FROM accounts a WHERE id=$1),
    'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t),
    'rule',(SELECT to_jsonb(r) FROM recurring_rules r WHERE id=$2),
    'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY request_id) FROM transaction_requests r)) AS value`,
    [ids.accountA, ruleId])).rows[0].value;
}
async function outbox() {
  return (await db.query(`SELECT id,user_id,event_key,payload,attempts,delivered_at,
    last_error,available_at,lease_until,(lease_token IS NOT NULL) AS has_lease_token
    FROM notification_outbox ORDER BY id`)).rows;
}
function dispatcherClient(): any {
  const query = (sql: string, values: unknown[] = []) => asRole(db, 'service_role', null,
    (tx: Transaction) => tx.query(sql, values));
  return {
    async rpc(name: string, args: Record<string, any>) {
      if (name === 'claim_notification_outbox') return { data: (await query('SELECT * FROM claim_notification_outbox($1)', [args.p_limit])).rows, error: null };
      if (name === 'release_notification_outbox') {
        await query('SELECT release_notification_outbox($1)', [JSON.stringify(args.p_claims)]);
        return { data: null, error: null };
      }
      throw new Error(`Unsupported fixture RPC: ${name}`);
    },
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let update: Record<string, unknown> | undefined;
      const execute = async () => {
        if (table === 'users' && !update) {
          if (filters.length !== 1 || filters[0][0] !== 'id') throw new Error('Unsupported fixture user query');
          return { data: (await query('SELECT telegram_chat_id,telegram_bot_token FROM users WHERE id=$1', [filters[0][1]])).rows[0], error: null };
        }
        if (table !== 'notification_outbox' || !update) throw new Error(`Unsupported fixture table: ${table}`);
        const columns = Object.keys(update);
        if (columns.some(column => !['delivered_at','lease_until','lease_token','last_error','available_at'].includes(column)) || filters.some(([column]) => !['id','user_id','lease_token'].includes(column))) throw new Error('Unsupported fixture column');
        const values = [...Object.values(update), ...filters.map(([, value]) => value)];
        const statement = `UPDATE notification_outbox SET ${columns.map((column,index) => `${column}=$${index+1}`).join(',')}
          WHERE ${filters.map(([column],index) => `${column}=$${columns.length+index+1}`).join(' AND ')} RETURNING id`;
        return { data: (await query(statement,values)).rows[0] ?? null, error: null };
      };
      const builder: any = { eq(column:string,value:unknown) { filters.push([column,value]);return builder; },
        select() { return builder; }, update(value:Record<string,unknown>) { update=value;return builder; },
        single:execute,maybeSingle:execute,then(resolve:any,reject:any) { return execute().then(resolve,reject); } };
      return builder;
    },
  };
}

it('CP1-27: accepted provider message with lost ACK can repeat after durable restart without a second financial effect', async () => {
  const report: Record<string, any> = { case_id:'CP1-27',startedAt:new Date().toISOString(),status:'FAIL',complete_original_contract:false,
    productSourceRevision:'84df929ab2f169251a49f3e95d0e0c148dfcb87c',
    scope:'Real persisted PGlite/PostgreSQL bootstrap, migrations, atomic financial RPC and actual outbox worker; query adapter substitutes PostgREST; synthetic role fixture substitutes Auth; only sendTelegramDm replaced by an accepting-then-timeout provider double. No native stack, GoTrue, browser, credentials or external Telegram.',
    financialExactlyOnceScope:'One durable request, one expense and one balance change under the same request ID; does not guarantee exactly-once physical notification.',
    providerLimitation:'After a provider accepts a message but loses its acknowledgement, application cannot know physical delivery. This controlled provider model accepts both attempts, illustrating a possible duplicate. No Telegram exactly-once or automatic reconciliation is claimed.',
    assertions,providerEvents:[] };
  const directory = await mkdtemp(path.join(os.tmpdir(),'zarix-cp127-'));
  try {
    db=await PGlite.create(directory,{extensions:{uuid_ossp,pg_trgm}});
    await db.exec(platformSql);
    const sources=await bootstrapSources();report.sqlSources=sources.map(({path,sha256}:any)=>({path,sha256}));
    for(const source of sources) await db.exec(source.sql);
    await seedDatabase(db);
    report.postgresVersion=(await db.query('SELECT version() AS version')).rows[0];
    await db.query("UPDATE users SET status='ACTIVE',current_period_end=now()+interval '1 month',telegram_chat_id=12345 WHERE id=$1",[ids.a]);
    await db.query(`INSERT INTO recurring_rules(id,user_id,account_id,type,amount,currency,description,frequency,start_date,last_executed_date,notification_enabled)
      VALUES($1,$2,$3,'expense',1000,'ARS','CP1-27 aviso sintético','daily','2026-10-01','2026-10-05',true)`,[ruleId,ids.a,ids.accountA]);
    const receipt=await createOccurrence();
    const before=await financial();report.financialBefore=before;
    check('one committed expense debits account 10000 to9000',before.account.balance,9000);
    check('one occurrence row',before.transactions.length,1);
    check('occurrence amount1000',before.transactions[0].amount,1000);
    check('recurring marker advances inclusively to6Oct',before.rule.last_executed_date,'2026-10-06');
    check('one durable financial receipt',before.receipts.length,1);
    check('receipt owns exact occurrence request',before.receipts[0].request_id,requestId);
    const initialOutbox=await outbox();report.outboxInitial=initialOutbox;
    check('one durable notification intention',initialOutbox.length,1);
    check('outbox refers to committed movement',initialOutbox[0].payload.transactionId,receipt.id);
    check('outbox key exact recurring occurrence',initialOutbox[0].event_key,requestId);
    provider.send.mockReset();
    provider.send.mockImplementationOnce(async (chatId:number,text:string) => {
      report.providerEvents.push({attempt:1,syntheticChatId:chatId,text,accepted:true,acknowledgement:'lost; timeout thrown after acceptance'});
      throw new Error('Synthetic provider accepted message; acknowledgement timeout');
    }).mockImplementationOnce(async (chatId:number,text:string) => {
      report.providerEvents.push({attempt:2,syntheticChatId:chatId,text,accepted:true,acknowledgement:'confirmed'});
    });
    check('first provider ACK timeout counted as unconfirmed delivery',await deliverNotificationOutbox(dispatcherClient()),{delivered:0,failed:1});
    check('provider accepted before timeout',report.providerEvents.length,1);
    check('timeout does not change financial rows',await financial(),before);
    const pending=await outbox();report.outboxAfterTimeout=pending;
    check('timeout leaves durable undelivered intention',pending[0].delivered_at,null);
    check('provider raw timeout is replaced with safe uncertainty text',pending[0].last_error,'Entrega no confirmada');
    check('failed lease released',pending[0].has_lease_token,false);
    check('first lease attempt recorded',pending[0].attempts,1);
    check('retry is scheduled after current wall time',new Date(String(pending[0].available_at)).getTime()>Date.now(),true);
    await db.close();
    db=await PGlite.create(directory,{extensions:{uuid_ossp,pg_trgm}});report.databaseReopened=true;
    check('financial request survives DB close/reopen',await createOccurrence(),receipt);
    check('replay after reopen preserves full financial rows',await financial(),before);
    check('pending outbox survives DB close/reopen',await outbox(),pending);
    // Test scheduling control ONLY for this own event: no production clock or worker code changed.
    await db.query("UPDATE notification_outbox SET available_at=now()-interval '1 second' WHERE id=$1 AND user_id=$2 AND event_key=$3",[pending[0].id,ids.a,requestId]);
    report.schedulingFixture='Only this newly created event available_at advanced to now−1second to exercise retry without waiting60seconds; lease/attempt/financial rows untouched.';
    check('retry confirms same durable notification',await deliverNotificationOutbox(dispatcherClient()),{delivered:1,failed:0});
    const after=await financial();report.financialAfter=after;
    check('full financial snapshot identical after second provider acceptance',after,before);
    const delivered=await outbox();report.outboxAfterRetry=delivered;
    check('same unique outbox row remains',delivered.length,1);
    check('same outbox ID retained',delivered[0].id,pending[0].id);
    check('second attempt recorded durably',delivered[0].attempts,2);
    check('delivered timestamp confirmed',delivered[0].delivered_at!==null,true);
    check('safe error cleared after confirmed acknowledgement',delivered[0].last_error,null);
    check('no more claimable event after acknowledgement',await deliverNotificationOutbox(dispatcherClient()),{delivered:0,failed:0});
    check('double observed two possible physical acceptances',report.providerEvents.length,2);
    check('same message on both provider acceptances',report.providerEvents[1].text,report.providerEvents[0].text);
    check('no hidden additional provider call',provider.send.mock.calls.length,2);
    report.financialSha256Before=createHash('sha256').update(JSON.stringify(before)).digest('hex');
    report.financialSha256After=createHash('sha256').update(JSON.stringify(after)).digest('hex');
    report.observed={financialEffects:1,financialReceipts:1,balance:9000,occurrenceDate:'2026-10-06',outboxIntentions:1,workerAttempts:2,modeledProviderAcceptances:2,physicalTelegramDeliveries:'unknown; no external call',automaticProviderReconciliation:false};
    report.status='PASS';report.complete_original_contract=true;
  } finally {
    if(db&&!db.closed) await db.close();
    await rm(directory,{recursive:true,force:true});
    report.ownTemporaryDatabaseClosedAndRemoved=true;
    report.finishedAt=new Date().toISOString();
    report.assertionCounts={PASS:assertions.filter(a=>a.status==='PASS').length,FAIL:assertions.filter(a=>a.status==='FAIL').length};
    await writeFile(output,JSON.stringify(report,null,2)+'\n');
  }
},30_000);
