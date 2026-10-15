import { describe,expect,it } from 'vitest';
import { persistPendingAiChat,readPendingAiChat,clearPendingAiChat } from '@/lib/pending-ai-chat';
const entry={ownerId:'owner-a',key:'stable-key',payload:{message:'confirmar',history:[{role:'user' as const,text:'original target'}]}};
function storage(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};}
describe('durable unresolved AI request',()=>{
 it('restores exact owner/key/message/history after a fresh component instance',()=>{
  const db=storage();persistPendingAiChat(entry,db);expect(readPendingAiChat('owner-a',db)).toEqual(entry);
  expect(persistPendingAiChat({...entry,key:'wrong-new-key'},db).key).toBe('stable-key');
 });
 it('never replaces changed confirmation history or message while pending',()=>{
  const db=storage();persistPendingAiChat(entry,db);
  expect(()=>persistPendingAiChat({...entry,payload:{...entry.payload,history:[{role:'user',text:'other target'}]}},db)).toThrow('anterior');
  expect(readPendingAiChat('owner-a',db)).toEqual(entry);
 });
 it('cannot recover another authenticated owner’s pending intent',()=>{
  const db=storage();persistPendingAiChat(entry,db);expect(readPendingAiChat('owner-b',db)).toBeNull();
 });
 it('only clears the exact confirmed key and leaves stale acknowledgements inert',()=>{
  const db=storage();persistPendingAiChat(entry,db);clearPendingAiChat('owner-a','wrong-key',db);expect(readPendingAiChat('owner-a',db)).toEqual(entry);
  clearPendingAiChat('owner-a','stable-key',db);expect(readPendingAiChat('owner-a',db)).toBeNull();
 });
 it('fails before sending if durable storage cannot accept the pending intent',()=>{
  const db=storage();db.setItem=()=>{throw new Error('blocked storage');};expect(()=>persistPendingAiChat(entry,db)).toThrow('blocked storage');
 });
});
