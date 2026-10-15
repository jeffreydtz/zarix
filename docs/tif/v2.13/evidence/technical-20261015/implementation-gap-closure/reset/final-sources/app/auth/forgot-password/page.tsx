import PasswordRecoveryForm from '@/components/auth/PasswordRecoveryForm';

export default async function ForgotPasswordPage({ searchParams }: {
  searchParams: Promise<{ invalid_link?: string }>;
}) {
  const params = await searchParams;
  return <PasswordRecoveryForm mode="request" invalidLink={params.invalid_link === '1'} />;
}
