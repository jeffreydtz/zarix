'use client';

import { useState } from 'react';
import {
  CategoryIcon,
  EMOJI_ICONS,
  LUCIDE_ICON_OPTIONS,
  iconValueFromLucideName,
} from '@/lib/category-icons';
import { useRouter } from 'next/navigation';

export default function CreateCategoryButton() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🎯');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [iconMode, setIconMode] = useState<'emoji' | 'symbol'>('emoji');

  const handleCreate = async () => {
    if (!name.trim()) {
      alert('El nombre es requerido');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          icon: selectedIcon,
          type,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al crear la categoría');
      }

      setName('');
      setSelectedIcon('🎯');
      setType('expense');
      setIsOpen(false);
      router.refresh();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error al crear la categoría');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="btn btn-primary">
        + Nueva Categoría
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 sm:py-8 z-50 overflow-y-auto">
          <div className="bg-card rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Nueva Categoría</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Supermercado"
                  className="w-full px-4 py-2 rounded-lg border border-border bg-secondary"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setType('expense')}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      type === 'expense'
                        ? 'border-destructive bg-destructive/10'
                        : 'border-border'
                    }`}
                  >
                    📤 Gasto
                  </button>
                  <button
                    onClick={() => setType('income')}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      type === 'income'
                        ? 'border-success bg-success/10'
                        : 'border-border'
                    }`}
                  >
                    📥 Ingreso
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Ícono</label>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setIconMode('emoji')}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${
                      iconMode === 'emoji'
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'border-border'
                    }`}
                  >
                    Emoji
                  </button>
                  <button
                    type="button"
                    onClick={() => setIconMode('symbol')}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${
                      iconMode === 'symbol'
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'border-border'
                    }`}
                  >
                    Ícono estilo iOS
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto pr-1">
                  <div className="grid grid-cols-6 gap-2">
                  {iconMode === 'emoji' &&
                    EMOJI_ICONS.map((icon) => (
                      <button
                        type="button"
                        key={icon}
                        onClick={() => setSelectedIcon(icon)}
                        className={`p-3 text-2xl rounded-lg border-2 transition-all ${
                          selectedIcon === icon
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-muted-foreground/40'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  {iconMode === 'symbol' &&
                    LUCIDE_ICON_OPTIONS.map((name) => {
                      const value = iconValueFromLucideName(name);
                      return (
                        <button
                          type="button"
                          key={value}
                          onClick={() => setSelectedIcon(value)}
                          className={`p-3 rounded-lg border-2 transition-all flex items-center justify-center ${
                            selectedIcon === value
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-muted-foreground/40'
                          }`}
                        >
                          <CategoryIcon icon={value} className="w-5 h-5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={loading || !name.trim()}
                className="w-full btn btn-primary py-3 disabled:opacity-50"
              >
                {loading ? 'Creando...' : 'Crear Categoría'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
