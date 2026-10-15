// Hook/browser doubles exercise handlers, not real-browser rendering/layout.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const mocks = vi.hoisted(() => ({values:[] as any[],refs:[] as any[],stateIndex:0,refIndex:0,fetch:vi.fn()}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState(initial:unknown) {
    const i=mocks.stateIndex++; if(!(i in mocks.values)) mocks.values[i]=initial;
    return [mocks.values[i],(value:any)=>{mocks.values[i]=typeof value==='function'?value(mocks.values[i]):value;}];
  },
  useRef(initial:unknown) {const i=mocks.refIndex++; return mocks.refs[i]??={current:initial};},
  useEffect() {}, useMemo(fn:()=>unknown) {return fn();},
}));
import ExportImport from '@/components/settings/ExportImport';
import { getImportBatch } from '@/lib/import/batch-journal';
const owner='owner-a',hash='a'.repeat(64);
function render() {mocks.stateIndex=0;mocks.refIndex=0;return ExportImport();}
function text(node:any):string {
  if(node==null||typeof node==='boolean')return '';
  if(Array.isArray(node))return node.map(text).join(' ');
  if(typeof node==='string'||typeof node==='number')return String(node);
  return text(node.props?.children);
}
function find(node:any,predicate:(n:any)=>boolean):any {
  if(!node)return null;
  if(Array.isArray(node))return node.map(n=>find(n,predicate)).find(Boolean);
  if(predicate(node))return node;
  return find(node.props?.children,predicate);
}
const button=(tree:any,label:string)=>find(tree,n=>n.type==='button'&&text(n)===label);
const file=new File(['fixture rows'],'rows.csv');
async function select() {await find(render(),n=>n.props?.id==='import-file').props.onChange({target:{files:[file]}});}
const requests=()=>mocks.fetch.mock.calls.filter(c=>c[1].body.get('mode')==='import');
const response=(body:any,status=200)=>new Response(JSON.stringify(body),{status});
function defaultFetch(_url:string,init:any) {
  if(init.body.get('mode')==='preview') return Promise.resolve(response({success:true,fileHash:hash,ownerId:owner,unresolvedAccounts:[],accounts:[]}));
  return Promise.resolve(response({success:true,batchId:init.body.get('batchId'),imported:2,skipped:0}));
}
beforeEach(()=>{
  mocks.values=[];mocks.refs=[];mocks.fetch.mockReset().mockImplementation(defaultFetch);
  vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('fetch',mocks.fetch);
});
describe('import review and durable retry UI handlers',()=>{
  it('always previews before confirmation even when every account is recognized',async()=>{
    await select();expect(requests()).toHaveLength(0);
    expect(button(render(),'Confirmar importación').props.disabled).toBe(false);
    expect(await getImportBatch(owner,hash)).toBeNull();
    await button(render(),'Cancelar').props.onClick();expect(requests()).toHaveLength(0);
  });
  it('persists ID before sending, and blocks duplicate clicks and cancellation while pending',async()=>{
    let finish!:(r:Response)=>void;
    mocks.fetch.mockImplementation((url,init)=>init.body.get('mode')==='preview'?defaultFetch(url,init):new Promise(resolve=>{finish=resolve;}));
    await select();const tree=render();const first=button(tree,'Confirmar importación').props.onClick();
    await button(tree,'Confirmar importación').props.onClick();
    await vi.waitFor(()=>expect(requests()).toHaveLength(1));
    const saved=await getImportBatch(owner,hash);expect(saved?.id).toBe(requests()[0][1].body.get('batchId'));
    expect(button(render(),'Cancelar').props.disabled).toBe(true);
    finish(response({success:true,batchId:saved!.id,imported:2,skipped:0}));await first;
    expect((await getImportBatch(owner,hash))?.acknowledged).toBe(true);
  });
  it('lost reply followed by restart requires same-batch retry and blocks a fresh batch',async()=>{
    mocks.fetch.mockImplementation((url,init)=>init.body.get('mode')==='preview'?defaultFetch(url,init):Promise.reject(new Error('lost reply')));
    await select();await button(render(),'Confirmar importación').props.onClick();
    const saved=await getImportBatch(owner,hash);expect(saved?.acknowledged).toBe(false);
    expect(text(render())).toContain('El lote sigue guardado');
    mocks.values=[];mocks.refs=[];mocks.fetch.mockImplementation(defaultFetch);
    await select();expect(button(render(),'Confirmar importación').props.disabled).toBe(true);
    expect(text(render())).not.toContain('Importar como lote nuevo:');
    expect(text(render())).toContain('archivo original sin editarlo');
    find(render(),n=>n.type==='input'&&n.props.type==='radio').props.onChange();
    await button(render(),'Confirmar importación').props.onClick();
    expect(requests().map(c=>c[1].body.get('batchId'))).toEqual([saved!.id,saved!.id]);
  });
  it('keeps a server-reported unconfirmed row pending through reload and original-option retry',async()=>{
    mocks.fetch.mockImplementation((url,init)=>init.body.get('mode')==='preview'?defaultFetch(url,init):
      Promise.resolve(response({success:false,status:'pending',batchId:init.body.get('batchId'),
        imported:1,skipped:0,pending:1,error:'Response unavailable'},503)));
    await select();
    find(render(),n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
    await button(render(),'Confirmar importación').props.onClick();
    const saved=await getImportBatch(owner,hash);
    expect(saved?.acknowledged).toBe(false);expect(saved?.options.skipDuplicates).toBe(true);
    expect(text(render())).toContain('Importación pendiente de confirmación');
    expect(text(render()).replace(/\s+/g,' ')).toContain('1 transacciones confirmadas, 1 pendientes de confirmación');
    expect(text(render())).not.toContain('Importación completada');
    expect(text(render())).not.toContain('Filas omitidas');
    expect(text(render())).not.toContain('Importar como lote nuevo:');
    mocks.values=[];mocks.refs=[];mocks.fetch.mockImplementation(defaultFetch);
    await select();
    expect(text(render())).not.toContain('Importar como lote nuevo:');
    find(render(),n=>n.type==='input'&&n.props.type==='radio').props.onChange();
    await button(render(),'Confirmar importación').props.onClick();
    expect(requests().map(c=>c[1].body.get('batchId'))).toEqual([saved!.id,saved!.id]);
    expect(requests().map(c=>c[1].body.get('skipDuplicates'))).toEqual(['true','true']);
    expect((await getImportBatch(owner,hash))?.acknowledged).toBe(true);
    expect(text(render())).toContain('Importación completada');
  });
  it('does not acknowledge an inconsistent success containing pending rows',async()=>{
    mocks.fetch.mockImplementation((url,init)=>init.body.get('mode')==='preview'?defaultFetch(url,init):
      Promise.resolve(response({success:true,batchId:init.body.get('batchId'),imported:1,skipped:0,pending:1})));
    await select();await button(render(),'Confirmar importación').props.onClick();
    expect((await getImportBatch(owner,hash))?.acknowledged).toBe(false);
    expect(text(render())).toContain('Importación pendiente de confirmación');
    expect(text(render())).not.toContain('Importación completada');
  });
  it('keeps non-success HTTP responses retryable without suggesting an edited file',async()=>{
    mocks.fetch.mockImplementation((url,init)=>init.body.get('mode')==='preview'?defaultFetch(url,init):
      Promise.resolve(response({error:'Servicio no disponible'},500)));
    await select();await button(render(),'Confirmar importación').props.onClick();
    expect((await getImportBatch(owner,hash))?.acknowledged).toBe(false);
    expect(text(render())).toContain('Servicio no disponible');
    expect(text(render())).toContain('archivo original, sin editarlo');
    expect(text(render())).not.toContain('Importar como lote nuevo:');
  });
  it('an explicitly selected new batch creates a different ID for identical content',async()=>{
    await select();await button(render(),'Confirmar importación').props.onClick();
    const old=await getImportBatch(owner,hash);await select();
    const label=find(render(),n=>n.type==='label'&&text(n).includes('Importar como lote nuevo'));
    find(label,n=>n.type==='input').props.onChange();
    await button(render(),'Confirmar importación').props.onClick();
    expect((await getImportBatch(owner,hash))?.id).not.toBe(old?.id);
    expect(new Set(requests().map(c=>c[1].body.get('batchId'))).size).toBe(2);
  });
  it('invalid success acknowledgement remains retryable with original batch ID',async()=>{
    mocks.fetch.mockImplementation((url,init)=>init.body.get('mode')==='preview'?defaultFetch(url,init):Promise.resolve(response({success:true,batchId:'wrong',imported:2,skipped:0})));
    await select();await button(render(),'Confirmar importación').props.onClick();
    expect((await getImportBatch(owner,hash))?.acknowledged).toBe(false);
    expect(text(render())).not.toContain('Importación completada');
    expect(text(render())).toContain('El lote sigue guardado');
  });
  it('does not send when persisting the ID fails',async()=>{
    await select();vi.stubGlobal('indexedDB',{open:()=>{throw new Error('storage blocked');}});
    await button(render(),'Confirmar importación').props.onClick();
    expect(requests()).toHaveLength(0);expect(text(render())).toContain('No se inició la importación');
    expect(text(render())).not.toContain('El lote sigue guardado');
  });
});
