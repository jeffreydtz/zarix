import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { acknowledgeImportBatch, getImportBatch, prepareImportBatch } from '@/lib/import/batch-journal';

const draft = () => ({ ownerId: 'owner-a', fileHash: 'f'.repeat(64), fileName: 'rows.csv',
  options: { dateFormat: 'dmy' as const, resolutions: {}, skipDuplicates: false } });
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); });

describe('persisted import identity', () => {
  it('survives reload/module restart and retains original options on retry', async () => {
    const first = await prepareImportBatch(draft());
    vi.resetModules();
    const reloaded = await import('@/lib/import/batch-journal');
    expect(await reloaded.getImportBatch(first.ownerId, first.fileHash)).toEqual(first);
    const retry = await reloaded.prepareImportBatch({ ...draft(), options: { ...draft().options, skipDuplicates: true } });
    expect(retry).toEqual(first);
  });
  it('arbitrates concurrent tabs before either may send the financial request', async () => {
    const results = await Promise.all(Array.from({length:10}, () => prepareImportBatch(draft())));
    expect(new Set(results.map(r => r.id)).size).toBe(1);
    expect(await getImportBatch('owner-a', draft().fileHash)).toEqual(results[0]);
  });
  it('keeps acknowledged identity so repeating a file requires an explicit new-batch choice', async () => {
    const first = await prepareImportBatch(draft());
    await acknowledgeImportBatch(first);
    const retry = await prepareImportBatch(draft());
    expect(retry.id).toBe(first.id); expect(retry.acknowledged).toBe(false);
    // A replay is unconfirmed until its own response arrives.
    await expect(prepareImportBatch(draft(), first.id)).rejects.toThrow('pendiente de confirmación');
    await acknowledgeImportBatch(retry);
    const next = await prepareImportBatch(draft(), first.id);
    expect(next.id).not.toBe(first.id); expect(next.acknowledged).toBe(false);
    // Late response for old batch cannot overwrite the new batch's pointer.
    await acknowledgeImportBatch(first);
    expect(await getImportBatch(next.ownerId,next.fileHash)).toEqual(next);
  });
  it('prevents a stale tab from replacing a batch someone else already replaced', async () => {
    const first = await prepareImportBatch(draft());
    await acknowledgeImportBatch(first);
    const next = await prepareImportBatch(draft(), first.id);
    await expect(prepareImportBatch(draft(), first.id)).rejects.toThrow('otra pestaña');
    expect((await getImportBatch(next.ownerId,next.fileHash))?.id).toBe(next.id);
  });
  it('never replaces an unconfirmed batch, even after module restart', async () => {
    const first = await prepareImportBatch(draft());
    vi.resetModules();
    const reloaded = await import('@/lib/import/batch-journal');
    await expect(reloaded.prepareImportBatch(draft(), first.id)).rejects.toThrow('pendiente de confirmación');
    expect(await reloaded.getImportBatch(first.ownerId,first.fileHash)).toEqual(first);
  });
  it('isolates batches by signed-in owner and file content', async () => {
    const a = await prepareImportBatch(draft());
    const b = await prepareImportBatch({...draft(), ownerId:'owner-b'});
    const c = await prepareImportBatch({...draft(), fileHash:'b'.repeat(64)});
    expect(new Set([a.id,b.id,c.id]).size).toBe(3);
  });
  it('fails closed when local persistence is unavailable', async () => {
    vi.stubGlobal('indexedDB', {open:()=>{throw new Error('blocked storage');}});
    await expect(prepareImportBatch(draft())).rejects.toThrow('blocked storage');
  });
});
