import { USER_CLIENT_SAFE_COLUMNS } from '@/lib/constants/user-columns';
import { accountsService } from '@/lib/services/accounts';
import { createServiceClientSync } from '@/lib/supabase/server';
import type { FinancialContext } from '@/lib/ai/prompts';
import type { Category, User } from '@/types/database';

export async function loadRegistryFinancialContext(userId: string): Promise<FinancialContext> {
  const supabase = createServiceClientSync();
  const [userProfile, accounts, categories] = await Promise.all([
    supabase.from('users').select(USER_CLIENT_SAFE_COLUMNS).eq('id', userId).single(),
    accountsService.list(userId),
    supabase.from('categories').select('*').or(`user_id.eq.${userId},user_id.is.null`),
  ]);
  return {
    user: userProfile.data as unknown as User,
    accounts,
    categories: (categories.data ?? []) as Category[],
  };
}
