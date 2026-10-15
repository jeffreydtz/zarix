// Final-build derived scope, separate from the original fresh CP1-20 fixture.
// No I/O at import. Uses only the exact archived synthetic batch from attempt3.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const sourceReport=path.join(here,'attempt-3-fourteen-clock/verification.json');
const expectedReportSha256='15a19de84971bab4cf3cb1a268fa9fab3e5efff6590d01a67cf974c1a87e2e0f';

export async function runOriginalCp120Replay(c){
  await c.clock();
  const raw=await fs.readFile(sourceReport);assert.equal(c.digest(raw),expectedReportSha256);
  const prior=JSON.parse(raw);
  assert.equal(prior.buildBinding.revision,'836fd18b310a51cced9074b372a80ce5d7e1a870');
  assert.equal(prior.results.find(x=>x.id==='CP1-20').status,'FAIL');
  const fixture=prior.fixtures.find(x=>x.name?.includes(' CP1-20 '));
  const input=prior.inputs.find(x=>x.caseId==='CP1-20');
  assert.ok(fixture&&input);assert.equal(fixture.owner,c.user().id);assert.equal(input.owner,c.user().id);
  for(const id of [fixture.id,fixture.owner,input.batchId])assert.match(id,/^[a-f0-9-]{36}$/i);
  assert.match(input.file,/^inputs\/CP1-20-[a-f0-9-]{36}\.json$/i);
  const file=path.join(path.dirname(sourceReport),input.file),bytes=await fs.readFile(file);
  assert.equal(c.digest(bytes),input.sha256);
  const entries=JSON.parse(bytes.toString('utf8'));assert.deepEqual(entries.map(x=>x.amount),[500,700,0]);
  const user=c.lit(c.user().id),account=c.lit(fixture.id),batch=c.lit(input.batchId),prefix=c.lit(`import:${input.batchId}:%`);
  const snapshot=()=>({
    account:c.rows(`SELECT * FROM accounts WHERE id=${account} AND user_id=${user} ORDER BY id`),
    ledger:c.rows(`SELECT * FROM transactions WHERE user_id=${user} AND (account_id=${account} OR destination_account_id=${account}) ORDER BY id`),
    receipts:c.rows(`SELECT * FROM transaction_requests WHERE user_id=${user} AND request_id LIKE ${prefix} ORDER BY request_id`),
    batch:c.rows(`SELECT * FROM import_batches WHERE user_id=${user} AND batch_id=${batch} ORDER BY batch_id`),
  });
  const before=snapshot();
  c.check('Original fixture remains archived with balance10200',{count:before.account.length,active:before.account[0]?.is_active,balance:Number(before.account[0]?.balance)},{count:1,active:false,balance:10200});
  c.check('Only original two economic effects exist',before.ledger.filter(x=>x.type!=='adjustment').map(x=>({type:x.type,amount:Number(x.amount)})).sort((a,b)=>a.amount-b.amount),[{type:'expense',amount:500},{type:'income',amount:700}]);
  c.check('Original durable receipt indices remain0/1',before.receipts.map(x=>x.request_id),[0,1].map(index=>`import:${input.batchId}:transaction:${index}`));
  c.check('Original batch context exists once',before.batch.length,1);
  c.observe('Original batch replay independent full snapshot',{sourceReport:'attempt-3-fourteen-clock/verification.json',sourceReportSha256:expectedReportSha256,inputFile:input.file,inputSha256:input.sha256,batchId:input.batchId,owner:c.user().id,accountId:fixture.id,before,beforeSha256:c.digest(JSON.stringify(before)),scope:'Same file bytes, owner, batchId, format, dateFormat, resolutions and duplicate choice. No account reactivation, history edit or receipt deletion.'});
  const form=new FormData();
  form.set('file',new File([bytes],'CP1-20.json',{type:'application/json'}));
  for(const [key,value]of Object.entries({mode:'import',batchId:input.batchId,ownerId:c.user().id,dateFormat:'dmy',skipDuplicates:'false',resolutions:'{}'}))form.set(key,value);
  const response=await c.request('POST','/api/import/transactions',form);
  c.check('Original pending batch settles via normal-session HTTP200',response.status,200);
  c.check('Two durable acknowledgements and one invalid skip, no pending',{imported:response.body.imported,skipped:response.body.skipped,pending:response.body.pending,total:response.body.total,success:response.body.success},{imported:2,skipped:1,pending:0,total:3,success:true});
  c.check('The only skipped row is the known invalid zero amount',response.body.skippedDetails?.map(x=>x.title),['Fila omitida — monto inválido']);
  const after=snapshot();
  c.check('Full original account/ledger/receipts/batch are unchanged after replay',after,before);
  c.check('Source input/report bytes remain unchanged',{inputSha256:c.digest(await fs.readFile(file)),reportSha256:c.digest(await fs.readFile(sourceReport))},{inputSha256:input.sha256,reportSha256:expectedReportSha256});
  c.observe('Observed settled response and full snapshot parity',{rawResponse:response.body,afterSha256:c.digest(JSON.stringify(after)),beforeSha256:c.digest(JSON.stringify(before)),newFinancialEffects:after.ledger.length-before.ledger.length,newReceipts:after.receipts.length-before.receipts.length,accountStillArchived:after.account[0].is_active===false});
}
