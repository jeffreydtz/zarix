import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SettingsForm from '@/components/settings/SettingsForm';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/login');
  }

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Configuracion</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Personaliza tu experiencia en Zarix
          </p>
        </div>

        {user && <SettingsForm user={user} />}
      </div>
    </div>
  );
}
