// Real React/server markup and server-page guard with only Auth/navigation doubles.
// No hydration, browser interaction, viewport or real Auth acceptance claim.
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AuthApiError,AuthRetryableFetchError} from '@supabase/supabase-js';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({getUser:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:mocks.getUser}})}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()}),useSearchParams:()=>new URLSearchParams()}));
import PasswordRecoveryForm from '@/components/auth/PasswordRecoveryForm';
import ForgotPasswordPage from '@/app/auth/forgot-password/page';
import UpdatePasswordPage from '@/app/auth/update-password/page';
import LoginPage from '@/app/login/page';

beforeEach(()=>vi.clearAllMocks());
describe('Password recovery screen markup and protected password page',()=>{
 it('links the actual existing login screen to recovery without replacing password login',()=>{
  const html=renderToStaticMarkup(createElement(LoginPage));
  expect(html).toContain('href="/auth/forgot-password"');expect(html).toContain('¿Olvidaste tu contraseña?');expect(html).toContain('Ingresar');
 });
 it('shows an accessible public email form without consulting private Auth data',async()=>{
  const html=renderToStaticMarkup(await ForgotPasswordPage({searchParams:Promise.resolve({})}));
  expect(html).toContain('Recuperar contraseña');expect(html).toContain('for="recovery-email"');expect(html).toContain('type="email"');expect(html).toContain('recovery-email-help');expect(html).toContain('Enviar enlace de recuperación');expect(mocks.getUser).not.toHaveBeenCalled();
 });
 it('shows a safe invalid-link retry state without reflecting URL contents',async()=>{
  const html=renderToStaticMarkup(await ForgotPasswordPage({searchParams:Promise.resolve({invalid_link:'1'})}));
  expect(html).toContain('role="alert"');expect(html).toContain('El enlace no es válido o venció.');
 });
 it('renders the two protected password fields with the existing minimum and safe input types',()=>{
  const html=renderToStaticMarkup(createElement(PasswordRecoveryForm,{mode:'update',expectedUserId:'controlled-owner'}));
  expect(html.match(/type="password"/g)).toHaveLength(2);expect(html.match(/minLength="6"/g)).toHaveLength(2);expect(html).toContain('for="recovery-confirmation"');expect(html).toContain('autoComplete="new-password"');expect(html).toContain('Guardar nueva contraseña');
 });
 it('only renders the change-password form after normal verified getUser succeeds',async()=>{
  mocks.getUser.mockResolvedValueOnce({data:{user:{id:'controlled-owner'}},error:null});
  const html=renderToStaticMarkup(await UpdatePasswordPage());expect(html).toContain('id="recovery-password"');expect(mocks.getUser).toHaveBeenCalledOnce();
 });
 it.each([null,new AuthApiError('synthetic expired',401,'bad_jwt')])('does not show password inputs for a missing/rejected session',async error=>{
  mocks.getUser.mockResolvedValueOnce({data:{user:null},error});const html=renderToStaticMarkup(await UpdatePasswordPage());
  expect(html).not.toContain('type="password"');expect(html).toContain('href="/auth/forgot-password"');expect(html).toContain('El enlace no es válido o venció.');
 });
 it('keeps an Auth outage distinct from an expired recovery session',async()=>{
  mocks.getUser.mockRejectedValueOnce(new AuthRetryableFetchError('synthetic-private-provider-detail',503));
  const html=renderToStaticMarkup(await UpdatePasswordPage());expect(html).not.toContain('type="password"');expect(html).not.toContain('synthetic-private');expect(html).not.toContain('venció');expect(html).toContain('href="/auth/update-password"');expect(html).toContain('No pudimos verificar tu sesión.');
 });
});
