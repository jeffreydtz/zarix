import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import CategoriesList from '@/components/categories/CategoriesList';
import CreateCategoryButton from '@/components/categories/CreateCategoryButton';

export default async function CategoriesPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},is_system.eq.true`)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#06070A]">
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Categorías</h1>
            <CreateCategoryButton />
          </div>

          <CategoriesList categories={categories || []} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Categories page error:', error);
    redirect('/login');
  }
}
