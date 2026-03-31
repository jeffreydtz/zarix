'use client';

import { useState } from 'react';

const ICONS = ['🍔', '🏠', '🚗', '💊', '🎓', '🎮', '👕', '✈️', '💰', '🎯', '📱', '⚡'];

export default function CreateCategoryButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🎯');
  const [type, setType] = useState<'expense' | 'income'>('expense');

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

      if (!response.ok) throw new Error('Error creating category');

      setName('');
      setSelectedIcon('🎯');
      setType('expense');
      setIsOpen(false);
      window.location.reload();
    } catch (error) {
      console.error('Error:', error);
      alert('Error al crear la categoría');
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Nueva Categoría</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700"
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
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
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
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    📤 Gasto
                  </button>
                  <button
                    onClick={() => setType('income')}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      type === 'income'
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    📥 Ingreso
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Ícono</label>
                <div className="grid grid-cols-6 gap-2">
                  {ICONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setSelectedIcon(icon)}
                      className={`p-3 text-2xl rounded-lg border-2 transition-all ${
                        selectedIcon === icon
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
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
