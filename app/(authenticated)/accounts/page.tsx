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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Cuentas</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Administra tus cuentas y tarjetas
              </p>
            </div>
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
