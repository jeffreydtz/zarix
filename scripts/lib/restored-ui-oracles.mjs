// Independent, narrowly scoped SQL oracles for the preserved Native22 restore.
// Importing or constructing this object does not connect to PostgreSQL.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isolatedNativeTargets, isolatedPgEnvironment } from './test-isolated-native-target.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const canonical = ['account_creation_requests','accounts','ai_daily_usage','bot_sessions','budget_alerts','budgets','categories','import_batches','investment_create_requests','investment_sale_requests','investment_sales','investments','net_worth_snapshots','notification_outbox','plan_usage_cycles','plan_usage_requests','portfolio_performance_snapshots','recurring_rules','shared_expense_requests','shared_expense_splits','shared_expenses','shared_group_members','shared_groups','transaction_requests','transactions','users'];
const rowHashSql = alias => `encode(sha256(convert_to(to_jsonb(${alias})::text,'UTF8')),'hex')`;
const auxSources = ['blue','blue_buy','oficial','oficial_buy','mep','mep_buy','ccl','ccl_buy'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createRestoreOracle({ databaseUrl, pgBin }) {
  const checked = isolatedNativeTargets({ ZARIX_ISOLATED_DATABASE_CONFIRM:'synthetic-only', ZARIX_LOCAL_SUPABASE_URL:'http://127.0.0.1:55321', ZARIX_LOCAL_DATABASE_URL:databaseUrl.href || databaseUrl });
  assert.equal(checked.databaseUrl.hostname,'127.0.0.1'); assert.equal(checked.databaseUrl.port,'55322'); assert.equal(checked.database,'postgres');
  assert.ok(path.isAbsolute(pgBin));
  const pgEnv = isolatedPgEnvironment(checked.databaseUrl);
  const psql = path.join(pgBin,'psql');
  let usedPlanHash;
  const window = () => assert.equal(process.env.ZARIX_RESTORE_UI_WINDOW_CONFIRM,'post-load-exclusive','No SQL before the exclusive post-LOAD window');
  function command(query, writable = false) {
    window();
    const result = spawnSync(psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',`BEGIN ${writable ? '' : 'READ ONLY'};SET LOCAL TIME ZONE 'UTC';${query};COMMIT;`],{
      env:{...pgEnv,PGOPTIONS:`-c default_transaction_read_only=${writable ? 'off' : 'on'}`},encoding:'utf8',maxBuffer:32*1024*1024,
    });
    assert.equal(result.status,0,'Restored SQL failed; raw diagnostics deliberately omitted');
    return result.stdout.trim();
  }
  const sqlRead = query => command(query);
  const jsonRead = query => JSON.parse(sqlRead(query));
  function captureCanonical25() {
    const tables = jsonRead(`SELECT jsonb_build_object(${canonical.map(table=>`${literal(table)},(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')) FROM public.${table} t)`).join(',')})`);
    return { tableCount:25, hashScope:'Exact PostgreSQL JSONB text before numeric parsing; all public columns except exchange_rates/market_data_cache; Auth session changes excluded', sha256:digest(JSON.stringify(tables)), tables };
  }
  function captureFx() {
    const rows = jsonRead(`SELECT COALESCE(jsonb_object_agg(t.id::text,${rowHashSql('t')}),'{}'::jsonb) FROM public.exchange_rates t`);
    const ordered = Object.fromEntries(Object.entries(rows).sort(([a],[b])=>a.localeCompare(b)));
    return { rowCount:Object.keys(ordered).length, sha256:digest(JSON.stringify(ordered)), rows:ordered };
  }
  function captureMarketCache() {
    return jsonRead(`SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')) FROM public.market_data_cache t`);
  }
  function prepareAuxFx1200() {
    // The caller fsyncs this plan and its original-state checkpoint BEFORE SQL.
    // A later process must reload it, never generate a second plan for a retry.
    return {purpose:'restored-ui-aux-fx1200',version:1,target:{host:'127.0.0.1',port:'55322',database:'postgres'},timestamp:new Date().toISOString(),insertedIds:auxSources.map(()=>randomUUID()),sources:[...auxSources],fromCurrency:'USD',toCurrency:'ARS',rate:1200};
  }
  function appendAuxFx1200(plan, {alreadyCommitted=false} = {}) {
    window();assert.equal(typeof alreadyCommitted,'boolean');
    assert.equal(plan?.purpose,'restored-ui-aux-fx1200');assert.equal(plan.version,1);
    assert.deepEqual(plan.target,{host:'127.0.0.1',port:'55322',database:'postgres'});
    assert.equal(plan.rate,1200);assert.equal(plan.fromCurrency,'USD');assert.equal(plan.toCurrency,'ARS');
    assert.deepEqual(plan.sources,auxSources);assert.equal(plan.insertedIds.length,8);assert.equal(new Set(plan.insertedIds).size,8);
    for(const id of plan.insertedIds)assert.match(id,uuidPattern);
    assert.equal(new Date(plan.timestamp).toISOString(),plan.timestamp,'Preserve the original planned observation timestamp');
    const planHash=digest(JSON.stringify(plan));if(usedPlanHash)assert.equal(planHash,usedPlanHash,'Do not switch to a new auxiliary plan');usedPlanHash=planHash;
    const values=auxSources.map((source,index)=>`(${literal(plan.insertedIds[index])}::uuid,${literal(source)})`).join(',');
    const expected=`expected(id,source) AS (VALUES ${values})`;
    const observed=jsonRead(`WITH ${expected} SELECT jsonb_build_object('presentCount',count(r.id),'matchingCount',count(r.id) FILTER (WHERE r.source=e.source AND r.from_currency='USD' AND r.to_currency='ARS' AND r.rate=1200::numeric(20,8) AND r.timestamp=${literal(plan.timestamp)}::timestamptz),'insertedRowsHashById',COALESCE(jsonb_object_agg(r.id::text,${rowHashSql('r')}) FILTER (WHERE r.id IS NOT NULL),'{}'::jsonb)) FROM expected e LEFT JOIN public.exchange_rates r ON r.id=e.id`);
    assert.ok(observed.presentCount===0||observed.presentCount===8,'Partial auxiliary plan detected; preserve data and checkpoint');
    let result,action;
    if(observed.presentCount===8){
      assert.equal(observed.matchingCount,8,'Existing planned IDs do not match their original exact rows');
      result={insertedCount:8,timestamp:plan.timestamp,insertedRowsHashById:observed.insertedRowsHashById};action='reused';
    }else{
      assert.equal(alreadyCommitted,false,'Committed plan rows disappeared; never insert them again');
      result=JSON.parse(command(`WITH ${expected}, inserted AS (INSERT INTO public.exchange_rates(id,source,from_currency,to_currency,rate,timestamp) SELECT e.id,e.source,'USD','ARS',1200::numeric(20,8),${literal(plan.timestamp)}::timestamptz FROM expected e RETURNING *) SELECT jsonb_build_object('insertedCount',count(*),'timestamp',min(t.timestamp),'insertedRowsHashById',jsonb_object_agg(t.id::text,${rowHashSql('t')})) FROM inserted t`,true));action='inserted';
    }
    assert.equal(result.insertedCount,8);assert.deepEqual(Object.keys(result.insertedRowsHashById).sort(),[...plan.insertedIds].sort());
    return {...result,insertedIds:[...plan.insertedIds],sources:[...auxSources],fromCurrency:'USD',toCurrency:'ARS',rate:1200,action,newlyInsertedCount:action==='inserted'?8:0,planSha256:planHash,scope:'One checkpointed auxiliary plan only; exact existing rows reused after lost response/restart. No original FX updated/deleted; no automatic retries, backup-content or real-provider claim'};
  }
  function verifyAuxFxPreserved(original, setup) {
    const after=captureFx(),added=Object.keys(after.rows).filter(id=>!Object.hasOwn(original.rows,id));
    return setup.insertedCount===8&&added.length===8&&after.rowCount===original.rowCount+8&&
      Object.entries(original.rows).every(([id,hash])=>after.rows[id]===hash)&&
      added.every(id=>Object.hasOwn(setup.insertedRowsHashById,id)&&setup.insertedRowsHashById[id]===after.rows[id]);
  }
  function ownerFixture(userId) {
    assert.match(userId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const owner=literal(userId)+'::uuid';
    const result=jsonRead(`WITH active_accounts AS (
      SELECT * FROM public.accounts WHERE user_id=${owner} AND is_active
    ), visible_transactions AS (
      SELECT t.* FROM public.transactions t WHERE t.user_id=${owner} AND t.account_id IN (SELECT id FROM active_accounts)
        AND (t.destination_account_id IS NULL OR t.destination_account_id IN (SELECT id FROM active_accounts))
    ), month_window AS (
      SELECT date_trunc('month',COALESCE(min(transaction_date),CURRENT_TIMESTAMP)) AS first FROM visible_transactions
    ), month_totals AS (
      SELECT COALESCE(sum(CASE WHEN type='income' THEN amount * CASE upper(trim(currency)) WHEN 'ARS' THEN 1 WHEN 'USD' THEN 1200 END ELSE 0 END),0) AS income,
        COALESCE(sum(CASE WHEN type='expense' THEN amount * CASE upper(trim(currency)) WHEN 'ARS' THEN 1 WHEN 'USD' THEN 1200 END ELSE 0 END),0) AS expense
      FROM visible_transactions CROSS JOIN month_window WHERE transaction_date>=first AND transaction_date<first+interval '1 month'
    ), active_positions AS (
      SELECT i.*,CASE WHEN current_price IS NULL THEN upper(trim(purchase_currency))
        ELSE upper(trim(COALESCE(market_currency,CASE WHEN type IN ('stock_arg','cedear') THEN 'ARS' WHEN type IN ('stock_us','etf','crypto') THEN 'USD' WHEN type='bond' THEN COALESCE(purchase_currency,'ARS') ELSE COALESCE(purchase_currency,'USD') END))) END AS price_currency
      FROM public.investments i WHERE user_id=${owner} AND is_active
    ), values_usd AS (
      SELECT *,quantity*purchase_price/(CASE WHEN type='bond' THEN 100 ELSE 1 END)/(CASE WHEN upper(trim(purchase_currency))='ARS' THEN 1200 ELSE 1 END) AS cost_usd,
        quantity*COALESCE(current_price,purchase_price)/(CASE WHEN type='bond' THEN 100 ELSE 1 END)/(CASE WHEN price_currency='ARS' THEN 1200 ELSE 1 END) AS current_usd FROM active_positions
    ), portfolio AS (
      SELECT COALESCE(sum(current_usd),0) AS current_value,COALESCE(sum(cost_usd),0) AS purchase_value FROM values_usd
    ) SELECT jsonb_build_object(
      'accounts',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'type',type,'currency',currency,'balance',balance::text) ORDER BY sort_order,id),'[]'::jsonb) FROM active_accounts),
      'transactions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'accountId',account_id,'destinationAccountId',destination_account_id,'type',type,'amount',amount::text,'amountInAccountCurrency',amount_in_account_currency::text,'destinationAmountInAccountCurrency',destination_amount_in_account_currency::text,'description',description,'currency',currency,'transactionDate',transaction_date) ORDER BY transaction_date,id),'[]'::jsonb) FROM visible_transactions),
      'transferImpacts',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'sourceAccount',account_id,'destinationAccount',destination_account_id,'sourceImpact',(-amount_in_account_currency)::text,'destinationImpact',round(COALESCE(destination_amount_in_account_currency,amount*COALESCE(exchange_rate,1)),8)::text) ORDER BY id),'[]'::jsonb) FROM visible_transactions WHERE type='transfer'),
      'investments',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'type',type,'quantity',quantity::text,'purchasePrice',purchase_price::text,'purchaseCurrency',purchase_currency,'currentPrice',current_price::text,'priceCurrency',price_currency,'costBasisUsd',cost_usd::text,'currentValueUsd',current_usd::text) ORDER BY id),'[]'::jsonb) FROM values_usd),
      'sales',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'investmentId',investment_id,'quantity',quantity::text,'price',price::text,'currency',currency,'realizedPnlNative',realized_pnl_native::text,'realizedPnlUsd',realized_pnl_usd::text,'soldAt',sold_at) ORDER BY sold_at,id),'[]'::jsonb) FROM public.investment_sales WHERE user_id=${owner}),
      'analysis',(SELECT jsonb_build_object('startDate',to_char(first,'YYYY-MM-DD'),'endDate',to_char(first+interval '1 month'-interval '1 day','YYYY-MM-DD'),'month',to_char(first,'YYYY-MM'),'totalIncome',income::text,'totalExpenses',expense::text,'balance',(income-expense)::text) FROM month_window CROSS JOIN month_totals),
      'portfolio',(SELECT jsonb_build_object('totalCurrentValue',current_value::text,'totalPurchaseValue',purchase_value::text,'totalPnL',(current_value-purchase_value)::text,'totalRealizedPnLUsd',(SELECT COALESCE(sum(realized_pnl_usd),0)::text FROM public.investment_sales WHERE user_id=${owner})) FROM portfolio),
      'unsupportedCurrencies',(SELECT COALESCE(jsonb_agg(DISTINCT currency),'[]'::jsonb) FROM visible_transactions WHERE upper(trim(currency)) NOT IN ('ARS','USD')),
      'unsupportedPositionCurrencies',(SELECT COALESCE(jsonb_agg(DISTINCT purchase_currency||'/'||price_currency),'[]'::jsonb) FROM active_positions WHERE upper(trim(purchase_currency)) NOT IN ('ARS','USD','USDT','USDC','DAI','BUSD') OR price_currency NOT IN ('ARS','USD','USDT','USDC','DAI','BUSD')),
      'referenceArsPerUsd',1200,'scope','Actual restored Native22 owner rows; transfers may be absent because the original transfer test deleted its own fixture. Stored balances include direct initial fixture values, so this does not infer a complete opening ledger.')`);
    assert.deepEqual(result.unsupportedCurrencies,[],'Fixture currencies outside this declared independent ARS/USD oracle');
    assert.deepEqual(result.unsupportedPositionCurrencies,[],'Fixture position currencies outside the declared ARS/USD/stable oracle');
    return result;
  }
  function grantsDigest() {
    return jsonRead(`WITH catalog AS (SELECT jsonb_build_object(
      'relations',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forcedRls',c.relforcerowsecurity,'acl',(SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(c.relacl) a),'options',(SELECT jsonb_agg(o ORDER BY o) FROM unnest(c.reloptions) o)) ORDER BY c.relname),'[]'::jsonb) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','S')),
      'columns',(SELECT COALESCE(jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'acl',(SELECT jsonb_agg(v::text ORDER BY v::text) FROM unnest(a.attacl) v)) ORDER BY c.relname,a.attnum),'[]'::jsonb) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped),
      'policies',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname),'[]'::jsonb) FROM pg_policies p WHERE p.schemaname='public'),
      'functions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'config',p.proconfig,'acl',(SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(p.proacl) a)) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::jsonb) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace),
      'defaults',(SELECT COALESCE(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(d.defaclrole),'namespace',d.defaclnamespace,'type',d.defaclobjtype,'acl',(SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(d.defaclacl) a)) ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype),'[]'::jsonb) FROM pg_default_acl d WHERE d.defaclnamespace IN (0,'public'::regnamespace)),
      'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassRls',rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))
    ) AS data) SELECT jsonb_build_object('sha256',encode(sha256(convert_to(data::text,'UTF8')),'hex'),'relations',jsonb_array_length(data->'relations'),'policies',jsonb_array_length(data->'policies'),'functions',jsonb_array_length(data->'functions'),'scope','Public relation/column ACL, RLS/policies, routines, defaults and ordinary-role flags; no role passwords') FROM catalog`);
  }
  return {sqlRead,captureCanonical25,captureFx,captureMarketCache,prepareAuxFx1200,appendAuxFx1200,ownerFixture,grantsDigest,verifyAuxFxPreserved};
}
