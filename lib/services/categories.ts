import { createServiceClientSync } from '@/lib/supabase/server';
import type { Category } from '@/types/database';
import { findDuplicateCategory } from '@/lib/categories/synonyms';

export interface CreateCategoryInput {
  userId: string;
  name: string;
  type: 'expense' | 'income';
  icon: string;
  parentId?: string;
}

class CategoriesService {
  async list(userId: string): Promise<Category[]> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${userId},is_system.eq.true`)
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  }

  async create(input: CreateCategoryInput): Promise<{ category: Category; reused: boolean }> {
    const supabase = createServiceClientSync();
    const existing = await this.list(input.userId);
    const duplicate = findDuplicateCategory(input.name, input.type, existing);
    if (duplicate) {
      const row = existing.find((category) => category.id === duplicate.id);
      if (row) return { category: row, reused: true };
    }

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
    return { category: data, reused: false };
  }

  async getById(id: string, userId: string): Promise<Category> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .or(`user_id.eq.${userId},is_system.eq.true`)
      .single();

    if (error) throw error;
    return data;
  }

  async update(
    id: string,
    userId: string,
    updates: Partial<CreateCategoryInput>
  ): Promise<Category> {
    const supabase = createServiceClientSync();

    const { data: category } = await supabase
      .from('categories')
      .select('is_system')
      .eq('id', id)
      .single();

    if (category?.is_system) {
      throw new Error('Cannot update system category');
    }

    // Whitelist explícito: nunca volcar el body crudo (evita mass-assignment de
    // user_id / is_system / id, que escalaría privilegios o regalaría la categoría).
    const safe: Record<string, unknown> = {};
    if (updates.name !== undefined) safe.name = updates.name;
    if (updates.type !== undefined) safe.type = updates.type;
    if (updates.icon !== undefined) safe.icon = updates.icon;
    if (updates.parentId !== undefined) safe.parent_id = updates.parentId || null;

    const { data, error } = await supabase
      .from('categories')
      .update(safe)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string, userId: string): Promise<void> {
    const supabase = createServiceClientSync();

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
