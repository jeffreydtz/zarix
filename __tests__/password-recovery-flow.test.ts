// Local request logic with Auth SDK doubles; no provider or browser acceptance.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {
  PASSWORD_RECOVERY_EMAIL_MESSAGE,
  PasswordRecoveryError,
  requestPasswordRecovery,
  updateRecoveredPassword,
} from '@/lib/auth/password-recovery';

const auth={resetPasswordForEmail:vi.fn(),getUser:vi.fn(),updateUser:vi.fn()};
beforeEach(()=>{
 vi.clearAllMocks();auth.resetPasswordForEmail.mockResolvedValue({error:null});
 auth.getUser.mockResolvedValue({data:{user:{id:'controlled-owner'}},error:null});
 auth.updateUser.mockResolvedValue({data:{user:{id:'controlled-owner'}},error:null});
});
describe('Minimal password recovery request logic',()=>{
 it('requests the existing SDK email flow with the one fixed local callback target',async()=>{
  expect(await requestPasswordRecovery(auth,' owner@example.invalid ','https://zarix.example.invalid')).toBe(PASSWORD_RECOVERY_EMAIL_MESSAGE);
  expect(auth.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith('owner@example.invalid',{
   redirectTo:'https://zarix.example.invalid/auth/callback?next=%2Fauth%2Fupdate-password',
  });expect(auth.getUser).not.toHaveBeenCalled();expect(auth.updateUser).not.toHaveBeenCalled();
 });
 it('gives unknown and existing addresses the same non-enumerating completion text',async()=>{
  expect(await requestPasswordRecovery(auth,'unknown@example.invalid','https://zarix.example.invalid')).toBe(await requestPasswordRecovery(auth,'known@example.invalid','https://zarix.example.invalid'));
 });
 it('rejects a blank email at its field before requesting mail',async()=>{
  await expect(requestPasswordRecovery(auth,' ','https://zarix.example.invalid')).rejects.toMatchObject({field:'email'});
  expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
 });
 it.each([false,true])('keeps request failures safe and retryable (throws=%s)',async throws=>{
  if(throws)auth.resetPasswordForEmail.mockRejectedValueOnce(new Error('synthetic-private-provider-token'));
  else auth.resetPasswordForEmail.mockResolvedValueOnce({error:new Error('synthetic-private-provider-token')});
  const error=await requestPasswordRecovery(auth,'owner@example.invalid','https://zarix.example.invalid').catch(e=>e);
  expect(error).toBeInstanceOf(PasswordRecoveryError);expect(error.field).toBe('email');expect(error.message).not.toContain('synthetic-private');
 });
 it.each([['short','short','password'],['abcdef','different','confirmation']])('retains the existing registration rule and field association',async(password,confirmation,field)=>{
  await expect(updateRecoveredPassword(auth,password,confirmation,'controlled-owner')).rejects.toMatchObject({field});
  expect(auth.getUser).not.toHaveBeenCalled();expect(auth.updateUser).not.toHaveBeenCalled();
 });
 it('verifies the normal current user and changes only that identity with the unchanged password',async()=>{
  await updateRecoveredPassword(auth,' password-with-spaces ',' password-with-spaces ','controlled-owner');
  expect(auth.getUser).toHaveBeenCalledOnce();expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({password:' password-with-spaces '});
 });
 it.each([null,{id:'different-owner'}])('does not submit an update after missing or switched identity',async user=>{
  auth.getUser.mockResolvedValueOnce({data:{user},error:null});
  await expect(updateRecoveredPassword(auth,'abcdef','abcdef','controlled-owner')).rejects.toMatchObject({field:'password'});
  expect(auth.updateUser).not.toHaveBeenCalled();
 });
 it('does not update on an Auth lookup outage or expose upstream details',async()=>{
  auth.getUser.mockRejectedValueOnce(new Error('synthetic-private-upstream'));
  await expect(updateRecoveredPassword(auth,'abcdef','abcdef','controlled-owner')).rejects.not.toThrow('synthetic-private');
  expect(auth.updateUser).not.toHaveBeenCalled();
 });
 it.each([null,{id:'different-owner'}])('never confirms a password update without the same returned identity',async user=>{
  auth.updateUser.mockResolvedValueOnce({data:{user},error:null});
  await expect(updateRecoveredPassword(auth,'abcdef','abcdef','controlled-owner')).rejects.toMatchObject({field:'password'});
 });
 it('never confirms a rejected password update or reflects the raw provider error',async()=>{
  auth.updateUser.mockResolvedValueOnce({data:{user:null},error:new Error('synthetic-private-password-error')});
  await expect(updateRecoveredPassword(auth,'abcdef','abcdef','controlled-owner')).rejects.not.toThrow('synthetic-private');
 });
});
