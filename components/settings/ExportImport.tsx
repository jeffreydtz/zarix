'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';

export default function ExportImport() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    imported?: number;
    skipped?: number;
    errors?: string[];
    message?: string;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/export/transactions?format=csv');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zarix-transactions-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Error exportando. Intentá de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportJSON = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/export/transactions?format=json');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zarix-transactions-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Error exportando. Intentá de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  const handleBackup = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/export/backup');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zarix-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Error creando backup. Intentá de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/transactions', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        setImportResult({ success: false, message: result.error });
      } else {
        setImportResult({
          success: true,
          imported: result.imported,
          skipped: result.skipped,
          errors: result.errors,
        });
      }
    } catch (error) {
      setImportResult({ success: false, message: 'Error importando archivo' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-6"
    >
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span>📦</span> Exportar / Importar
      </h2>

      <div className="space-y-6">
        {/* Export Section */}
        <div>
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Exportar transacciones
          </h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="btn bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm"
            >
              {exporting ? '...' : '📊 CSV (Excel)'}
            </button>
            <button
              onClick={handleExportJSON}
              disabled={exporting}
              className="btn bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm"
            >
              {exporting ? '...' : '📄 JSON'}
            </button>
            <button
              onClick={handleBackup}
              disabled={exporting}
              className="btn bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-sm"
            >
              {exporting ? '...' : '💾 Backup completo'}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            CSV es compatible con Excel. JSON es mejor para programadores. Backup incluye todo.
          </p>
        </div>

        {/* Import Section */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Importar transacciones
          </h3>
          
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.json"
            onChange={handleImport}
            className="hidden"
            id="import-file"
          />
          
          <label
            htmlFor="import-file"
            className={`
              inline-flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer
              border-2 border-dashed border-slate-300 dark:border-slate-600
              hover:border-blue-500 dark:hover:border-blue-400
              transition-colors
              ${importing ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <span>📥</span>
            <span>{importing ? 'Importando...' : 'Seleccionar archivo CSV o JSON'}</span>
          </label>

          <p className="text-xs text-slate-500 mt-2">
            El CSV debe tener columnas: Fecha, Tipo, Monto, Moneda, Cuenta, Categoría (opcional), Descripción (opcional)
          </p>
        </div>

        {/* Import Result */}
        {importResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className={`p-4 rounded-lg ${
              importResult.success 
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}
          >
            {importResult.success ? (
              <div>
                <p className="font-medium text-green-700 dark:text-green-400">
                  ✅ Importación completada
                </p>
                <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                  {importResult.imported} transacciones importadas
                  {importResult.skipped && importResult.skipped > 0 && `, ${importResult.skipped} omitidas`}
                </p>
                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    <p className="font-medium">Advertencias:</p>
                    <ul className="list-disc list-inside">
                      {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-red-700 dark:text-red-400">
                ❌ {importResult.message || 'Error en la importación'}
              </p>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
