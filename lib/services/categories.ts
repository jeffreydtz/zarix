import { createServiceClient } from '@/lib/supabase/server';
import type { Category } from '@/types/database';

export interface CreateCategoryInput {
  userId: string;
  name: string;
  type: 'expense' | 'income';
  icon: string;
  parentId?: string;
}

class CategoriesService {
  async list(userId: string): Promise<Category[]> {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${userId},is_system.eq.true`)
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('categories')
      .insert({
        user_id: input.userId,
        name: input.name,
        type: input.type,
        icon: input.icon,
        parent_id: input.parentId || null,
        is_system: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string, userId: string): Promise<void> {
    const supabase = await createServiceClient();

    const { data: category } = await supabase
      .from('categories')
      .select('is_system')
      .eq('id', id)
      .single();

    if (category?.is_system) {
      throw new Error('Cannot delete system category');
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }
}

export const categoriesService = new CategoriesService();
