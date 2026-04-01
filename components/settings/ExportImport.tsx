'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ExportImport() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    imported?: number;
    skipped?: number;
    errors?: string[];
    message?: string;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reviewStep, setReviewStep] = useState(false);
  const [unresolvedAccounts, setUnresolvedAccounts] = useState<string[]>([]);
  const [availableAccounts, setAvailableAccounts] = useState<Array<{ id: string; name: string; currency: string }>>([]);
  const [resolutions, setResolutions] = useState<
    Record<string, { action: 'none' | 'map' | 'keep_name'; accountId?: string }>
  >({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/export/transactions?format=csv');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al exportar CSV');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zarix-transactions-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(error.message || 'Error exportando. Intentá de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportJSON = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/export/transactions?format=json');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al exportar JSON');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zarix-transactions-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(error.message || 'Error exportando. Intentá de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  const handleBackup = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/export/backup');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al crear el backup');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zarix-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(error.message || 'Error creando backup. Intentá de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    setSelectedFile(file);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'preview');

      const response = await fetch('/api/import/transactions', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        setImportResult({ success: false, message: result.error });
      } else {
        const unresolved = (result.unresolvedAccounts || []) as string[];
        setUnresolvedAccounts(unresolved);
        setAvailableAccounts(result.accounts || []);
        setResolutions(
          Object.fromEntries(
            unresolved.map((name: string) => [name, { action: 'none' as const }])
          )
        );
        setReviewStep(unresolved.length > 0);

        if (unresolved.length === 0) {
          await handleConfirmImport(file, {});
        }
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

  const handleConfirmImport = async (
    fileArg?: File,
    resolutionsArg?: Record<string, { action: 'none' | 'map' | 'keep_name'; accountId?: string }>
  ) => {
    const file = fileArg || selectedFile;
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'import');
      formData.append('resolutions', JSON.stringify(resolutionsArg || resolutions));

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
        setReviewStep(false);
        setUnresolvedAccounts([]);
      }
    } catch (error) {
      setImportResult({ success: false, message: 'Error confirmando importación' });
    } finally {
      setImporting(false);
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Importar transacciones
            </h3>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              {showGuide ? '▲ Ocultar guía' : '▼ Ver guía de formato'}
            </button>
          </div>

          {/* Import Guide */}
          <AnimatePresence>
            {showGuide && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden"
              >
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-sm space-y-4">
                  
                  {/* CSV Format */}
                  <div>
                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                      📊 Formato CSV (Excel)
                    </h4>
                    <p className="text-slate-600 dark:text-slate-400 mb-2">
                      Creá un archivo con estas columnas. El orden no importa:
                    </p>
                    <div className="bg-white dark:bg-slate-800 rounded p-3 font-mono text-xs overflow-x-auto">
                      <div className="text-slate-500">Fecha,Tipo,Monto,Moneda,Cuenta,Categoría,Descripción</div>
                      <div>01/03/2026,Gasto,5000,ARS,Efectivo ARS,Comida,Almuerzo</div>
                      <div>05/03/2026,Gasto,1500,ARS,Mercado Pago,Transporte,Uber</div>
                      <div>10/03/2026,Ingreso,850000,ARS,BBVA,Sueldo,Sueldo marzo</div>
                    </div>
                  </div>

                  {/* Column mapping */}
                  <div>
                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                      🔗 Mapeo de columnas
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Fecha *</span>
                        <span className="text-slate-500">DD/MM/YYYY o YYYY-MM-DD</span>
                      </div>
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Monto *</span>
                        <span className="text-slate-500">Número positivo (ej: 5000)</span>
                      </div>
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Tipo</span>
                        <span className="text-slate-500">Gasto, Ingreso, Transferencia</span>
                      </div>
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Moneda</span>
                        <span className="text-slate-500">ARS, USD (default: ARS)</span>
                      </div>
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Cuenta</span>
                        <span className="text-slate-500">Nombre exacto de tu cuenta</span>
                      </div>
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Categoría</span>
                        <span className="text-slate-500">Nombre de categoría existente</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">* Campos obligatorios</p>
                  </div>

                  {/* JSON Format */}
                  <div>
                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                      📄 Formato JSON
                    </h4>
                    <div className="bg-white dark:bg-slate-800 rounded p-3 font-mono text-xs overflow-x-auto">
                      <pre>{`[
  {
    "date": "2026-03-01",
    "type": "expense",
    "amount": 5000,
    "currency": "ARS",
    "account": "Efectivo ARS",
    "category": "Comida",
    "description": "Almuerzo"
  }
]`}</pre>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Valores de type: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">expense</code>, <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">income</code>, <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">transfer</code>
                    </p>
                  </div>

                  {/* Tips */}
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                    <h4 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">
                      💡 Tips importantes
                    </h4>
                    <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
                      <li>La <strong>Cuenta</strong> debe existir en Zarix antes de importar</li>
                      <li>En Excel, guardá como <strong>&quot;CSV UTF-8&quot;</strong> para los acentos</li>
                      <li>No uses separador de miles (escribí 5000, no 5.000)</li>
                      <li>Si la cuenta no se encuentra, se busca una con la misma moneda</li>
                      <li>Las categorías que no existan se ignoran (se importa sin categoría)</li>
                    </ul>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
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
            Aceptamos archivos .csv (Excel) y .json
          </p>

          {reviewStep && unresolvedAccounts.length > 0 && (
            <div className="mt-4 p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
              <h4 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">
                Cuentas no reconocidas (import masivo)
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                Elegí para cada cuenta: asignar una existente, dejar sin cuenta o guardar el nombre original.
              </p>
              <div className="space-y-3">
                {unresolvedAccounts.map((name) => {
                  const current = resolutions[name] || { action: 'none' as const };
                  return (
                    <div key={name} className="p-3 rounded bg-white dark:bg-slate-800 border border-amber-100 dark:border-amber-700/50">
                      <div className="text-sm font-medium mb-2">{name}</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <select
                          className="input"
                          value={current.action}
                          onChange={(e) =>
                            setResolutions((prev) => ({
                              ...prev,
                              [name]: { ...prev[name], action: e.target.value as 'none' | 'map' | 'keep_name' },
                            }))
                          }
                        >
                          <option value="none">Dejar sin cuenta</option>
                          <option value="map">Asignar a cuenta existente</option>
                          <option value="keep_name">Guardar nombre original en notas</option>
                        </select>

                        {current.action === 'map' && (
                          <select
                            className="input md:col-span-2"
                            value={current.accountId || ''}
                            onChange={(e) =>
                              setResolutions((prev) => ({
                                ...prev,
                                [name]: { ...prev[name], accountId: e.target.value },
                              }))
                            }
                          >
                            <option value="">Seleccionar cuenta...</option>
                            {availableAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.currency})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleConfirmImport()}
                  disabled={importing}
                  className="btn btn-primary"
                >
                  {importing ? 'Importando...' : 'Confirmar importación'}
                </button>
                <button
                  onClick={() => {
                    setReviewStep(false);
                    setUnresolvedAccounts([]);
                    setSelectedFile(null);
                  }}
                  className="btn"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
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
