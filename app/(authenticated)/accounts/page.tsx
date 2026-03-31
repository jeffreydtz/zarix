import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import AccountsList from '@/components/accounts/AccountsList';
import CreateAccountButton from '@/components/accounts/CreateAccountButton';

export default async function AccountsPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const accounts = await accountsService.list(user.id).catch(() => []);

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Cuentas</h1>
            <CreateAccountButton />
          </div>

          <AccountsList accounts={accounts} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Accounts page error:', error);
    redirect('/login');
  }
}
