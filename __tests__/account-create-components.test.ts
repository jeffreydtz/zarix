// Execute the actual component submit handlers with deterministic hook doubles.
// No DOM, IndexedDB or browser integration is claimed by these tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({states:[] as any[],refs:[] as any[],stateIndex:0,refIndex:0,submit:vi.fn(),refresh:vi.fn(),
 runEffects:false,cleanups:[] as Array<()=>void>}));
vi.mock('react',async importOriginal=>{
 const actual=await importOriginal<any>();return {...actual,useEffect:(effect:()=>void|(()=>void))=>{if(mocks.runEffects){const cleanup=effect();if(cleanup)mocks.cleanups.push(cleanup);}},
 useState:(initial:any)=>{const i=mocks.stateIndex++;if(!(i in mocks.states))mocks.states[i]=typeof initial==='function'?initial():initial;
 return [mocks.states[i],(next:any)=>{mocks.states[i]=typeof next==='function'?next(mocks.states[i]):next;}];},
 useRef:(initial:any)=>{const i=mocks.refIndex++;mocks.refs[i]??={current:initial};return mocks.refs[i];}};
});
vi.mock('framer-motion',()=>({motion:new Proxy({},{get:(_target,key)=>String(key)}),AnimatePresence:'div'}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock('@/lib/hooks/useBodyScrollLock',()=>({useBodyScrollLock:()=>undefined}));
vi.mock('@/lib/account-create-request',()=>({submitAccountCreation:mocks.submit}));
vi.mock('@/lib/offline-reference-cache',()=>({getOfflineReferenceOwner:async()=>'owner',REFERENCE_OWNER_CHANGED:'zarix-reference-owner-changed'}));
import CreateAccountButton from '@/components/accounts/CreateAccountButton';
import { QuickCreateAccountPanel } from '@/components/expenses/InlineQuickCreate';
function find(node:any,predicate:(node:any)=>boolean):any{
 if(!node)return null;if(Array.isArray(node)){for(const child of node){const hit=find(child,predicate);if(hit)return hit;}return null;}
 if(typeof node!=='object')return null;if(predicate(node))return node;return find(node.props?.children,predicate);
}
function render(component:()=>any){mocks.stateIndex=0;mocks.refIndex=0;return component();}
beforeEach(()=>{vi.clearAllMocks();mocks.states=[];mocks.refs=[];mocks.runEffects=false;mocks.cleanups=[];vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('window',new EventTarget());});
afterEach(()=>{mocks.cleanups.forEach(cleanup=>cleanup());vi.unstubAllGlobals();});
describe('account component response-loss and rejection behavior',()=>{
 it.each(['HTTP 400','HTTP 403','timeout'])('full account modal stays open with original data after %s and only clears after verified confirmation',async error=>{
  mocks.states=[true,false,'',false,'Fixture','💳','bank','ARS','100',false,true,'','','',false,'USD'];
  mocks.submit.mockImplementationOnce(async(attempt,payload,options)=>{attempt.pending={id:'same-id',payload};options.onPending(payload);return {state:'pending',message:error};});
  const first=render(()=>CreateAccountButton());const button=find(first,n=>n.props?.onClick&&n.props?.className?.includes('w-full btn btn-primary'));
  await button.props.onClick();
  expect(mocks.states[0]).toBe(true);expect(mocks.states[4]).toBe('Fixture');expect(mocks.states[3]).toBe(true);expect(mocks.states[2]).toBe(error);expect(mocks.refresh).not.toHaveBeenCalled();
  const originalAttempt=mocks.submit.mock.calls[0][0];
  mocks.submit.mockImplementationOnce(async attempt=>{expect(attempt).toBe(originalAttempt);expect(attempt.pending.id).toBe('same-id');return {state:'confirmed',account:{id:'created'}};});
  await find(render(()=>CreateAccountButton()),n=>n.props?.onClick&&n.props?.className?.includes('w-full btn btn-primary')).props.onClick();
  expect(mocks.states[0]).toBe(false);expect(mocks.states[4]).toBe('');expect(mocks.refresh).toHaveBeenCalledOnce();
 });
 it('inline create never calls onCreated on rejection or timeout and retries the same pending attempt',async()=>{
  mocks.runEffects=true;mocks.states=['Fixture','bank','ARS','100',false,'',false];const onCreated=vi.fn();
  mocks.submit.mockImplementation(async(attempt,payload,options)=>{attempt.pending??={id:'same-inline-id',payload};options.onPending(payload);return {state:'pending',message:'timeout'};});
  for(let n=0;n<2;n++)await find(render(()=>QuickCreateAccountPanel({onCreated,onCancel:vi.fn()})),node=>node.props?.onClick&&node.props?.className?.includes('btn btn-primary')).props.onClick();
  expect(onCreated).not.toHaveBeenCalled();expect(mocks.states[0]).toBe('Fixture');expect(mocks.submit.mock.calls[1][0].pending.id).toBe('same-inline-id');
 });
});
