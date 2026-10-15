import assert from 'node:assert/strict';
import { createFrozenDate } from './clock-preload.mjs';

const OriginalDate=globalThis.Date;
const epoch=OriginalDate.parse('2026-10-06T12:00:00.000Z');
const FrozenDate=createFrozenDate(OriginalDate,epoch);
assert.equal(new FrozenDate().toISOString(),'2026-10-06T12:00:00.000Z');
assert.equal(FrozenDate.now(),epoch);
assert.equal(FrozenDate(),new OriginalDate(epoch).toString());
assert.equal(new FrozenDate('2026-10-15T03:00:00.000Z').toISOString(),'2026-10-15T03:00:00.000Z');
assert.equal(new FrozenDate(0).getTime(),0);
assert.equal(new FrozenDate(2026,9,6,12).getTime(),new OriginalDate(2026,9,6,12).getTime());
assert.equal(FrozenDate.parse('2026-10-15T03:00:00Z'),OriginalDate.parse('2026-10-15T03:00:00Z'));
assert.equal(FrozenDate.UTC(2026,9,6,12),OriginalDate.UTC(2026,9,6,12));
assert.ok(new FrozenDate() instanceof OriginalDate);
assert.ok(new OriginalDate() instanceof FrozenDate);
assert.equal(new FrozenDate().constructor,FrozenDate);
class ChildDate extends FrozenDate {}
const child=new ChildDate();
assert.ok(child instanceof ChildDate);
assert.equal(new OriginalDate() instanceof ChildDate,false);
assert.equal(child.toISOString(),'2026-10-06T12:00:00.000Z');
assert.equal(globalThis.Date,OriginalDate,'Factory test must leave this process/global clock unchanged');
assert.throws(()=>createFrozenDate(OriginalDate,NaN));
// Next15 copies only own Date descriptors into its environment extension.
// Exercise the actual installed extension, not an imitation of that code.
assert.equal(Object.hasOwn(FrozenDate,'parse'),true);
assert.equal(Object.hasOwn(FrozenDate,'UTC'),true);
try {
  globalThis.Date=FrozenDate;
  await import('next/dist/server/node-environment-extensions/date.js');
  assert.equal(Date.parse('2026-10-15T03:00:00Z'),OriginalDate.parse('2026-10-15T03:00:00Z'));
  assert.equal(Date.UTC(2026,9,6,12),OriginalDate.UTC(2026,9,6,12));
  assert.equal(new Date().toISOString(),'2026-10-06T12:00:00.000Z');
} finally {globalThis.Date=OriginalDate;}
console.log(JSON.stringify({status:'PASS_MODEL_ONLY',assertions:21,scope:'Pure date-model plus actual installed Next15 Date-extension assertions. No Nextserver/OS/Auth clock, network, browser or database operation.'}));
