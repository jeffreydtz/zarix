'use client';

import type { Category } from '@/types/database';
import { useState } from 'react';
import {
  CategoryIcon,
  EMOJI_ICONS,
  LUCIDE_ICON_OPTIONS,
  iconValueFromLucideName,
} from '@/lib/category-icons';

interface CategoriesListProps {
  categories: Category[];
}

export default function CategoriesList({ categories }: CategoriesListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editType, setEditType] = useState<'expense' | 'income'>('expense');
  const [editIconMode, setEditIconMode] = useState<'emoji' | 'symbol'>('emoji');
  const [loading, setLoading] = useState(false);

  const userCategories = categories.filter((c) => !c.is_system);
  const systemCategories = categories.filter((c) => c.is_system);

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditIcon(category.icon || '🎯');
    setEditType(category.type);
    setEditIconMode((category.icon || '').startsWith('lucide:') ? 'symbol' : 'emoji');
  };

  const handleSave = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: editName,
          icon: editIcon,
          type: editType,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al actualizar la categoría');
      }

      window.location.reload();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error al actualizar la categoría');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar la categoría "${name}"?`)) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error deleting category');
      }

      window.location.reload();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error al eliminar la categoría');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateSystemCategory = async (category: Category) => {
    setLoading(true);
    try {
      const createCategory = async (name: string) =>
        fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            icon: category.icon || '🎯',
            type: category.type,
          }),
        });

      let response = await createCategory(category.name);

      // If user already has one with same name/type, fallback to a personalized name.
      if (!response.ok) {
        response = await createCategory(`${category.name} (mía)`);
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo duplicar la categoría');
      }

      window.location.reload();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error al duplicar la categoría');
    } finally {
      setLoading(false);
    }
  };

  const renderCategory = (category: Category, isSystem: boolean) => (
    <div key={category.id} className="card hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          {editingId === category.id ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditIconMode('emoji')}
                  className={`px-2 py-1 rounded text-xs border ${
                    editIconMode === 'emoji'
                      ? 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  Emoji
                </button>
                <button
                  type="button"
                  onClick={() => setEditIconMode('symbol')}
                  className={`px-2 py-1 rounded text-xs border ${
                    editIconMode === 'symbol'
                      ? 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  Ícono
                </button>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {editIconMode === 'emoji' &&
                  EMOJI_ICONS.map((icon) => (
                    <button
                      type="button"
                      key={icon}
                      onClick={() => setEditIcon(icon)}
                      className={`text-xl p-1 rounded ${
                        editIcon === icon ? 'bg-blue-100 dark:bg-blue-900' : ''
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                {editIconMode === 'symbol' &&
                  LUCIDE_ICON_OPTIONS.map((name) => {
                    const value = iconValueFromLucideName(name);
                    return (
                      <button
                        type="button"
                        key={value}
                        onClick={() => setEditIcon(value)}
                        className={`p-2 rounded flex items-center justify-center ${
                          editIcon === value ? 'bg-blue-100 dark:bg-blue-900' : ''
                        }`}
                      >
                        <CategoryIcon icon={value} className="w-4 h-4" />
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="text-3xl">
              <CategoryIcon icon={category.icon || '🎯'} className="w-7 h-7" />
            </div>
          )}

          <div className="flex-1">
            {editingId === category.id ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="font-semibold px-2 py-1 border rounded dark:bg-gray-700 w-full"
                  autoFocus
                />
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as 'expense' | 'income')}
                  className="px-2 py-1 border rounded dark:bg-gray-700 text-sm"
                >
                  <option value="expense">📤 Gasto</option>
                  <option value="income">📥 Ingreso</option>
                </select>
              </div>
            ) : (
              <div>
                <div className="font-semibold">{category.name}</div>
                <div className="text-sm text-gray-500">
                  {category.type === 'expense' ? '📤 Gasto' : '📥 Ingreso'}
                  {isSystem && ' • Sistema'}
                </div>
              </div>
            )}
          </div>
        </div>

        {!isSystem && (
          <div className="flex gap-2">
            {editingId === category.id ? (
              <>
                <button
                  onClick={() => handleSave(category.id)}
                  disabled={loading}
                  className="text-green-600 hover:text-green-700 px-3 py-1 disabled:opacity-50"
                >
                  ✓
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  disabled={loading}
                  className="text-gray-600 hover:text-gray-700 px-3 py-1 disabled:opacity-50"
                >
                  ✕
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleEdit(category)}
                  className="text-blue-600 hover:text-blue-700 px-3 py-1 text-sm font-medium"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(category.id, category.name)}
                  className="text-red-600 hover:text-red-700 px-3 py-1 text-sm font-medium"
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        )}
        {isSystem && (
          <div className="flex gap-2">
            <button
              onClick={() => handleDuplicateSystemCategory(category)}
              disabled={loading}
              className="text-emerald-600 hover:text-emerald-700 px-3 py-1 text-sm font-medium disabled:opacity-50"
            >
              Duplicar a mis categorías
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {userCategories.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Mis Categorías</h2>
          <div className="space-y-2">
            {userCategories.map((cat) => renderCategory(cat, false))}
          </div>
        </div>
      )}

      {systemCategories.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Categorías del Sistema</h2>
          <div className="space-y-2">
            {systemCategories.map((cat) => renderCategory(cat, true))}
          </div>
        </div>
      )}

      {userCategories.length === 0 && systemCategories.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No hay categorías todavía</p>
          <p className="text-sm text-gray-400">Creá tu primera categoría personalizada</p>
        </div>
      )}
    </div>
  );
}
