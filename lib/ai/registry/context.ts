import { USER_CLIENT_SAFE_COLUMNS } from '@/lib/constants/user-columns';
import { accountsService } from '@/lib/services/accounts';
import { createServiceClientSync } from '@/lib/supabase/server';
import type { FinancialContext } from '@/lib/ai/prompts';
import type { Category, User } from '@/types/database';

export async function loadRegistryFinancialContext(userId: string): Promise<FinancialContext> {
  const supabase = createServiceClientSync();
  const [userProfile, accounts, userCategories, systemCategories] = await Promise.all([
    supabase.from('users').select(USER_CLIENT_SAFE_COLUMNS).eq('id', userId).single(),
    accountsService.list(userId),
    supabase.from('categories').select('*').eq('user_id', userId),
    supabase.from('categories').select('*').eq('is_system', true),
  ]);
  return {
    user: userProfile.data as unknown as User,
    accounts,
    categories: [...((userCategories.data ?? []) as Category[]), ...((systemCategories.data ?? []) as Category[])],
  };
}
