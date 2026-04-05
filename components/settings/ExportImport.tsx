'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ImportSkippedDetail } from '@/types/import';

export default function ExportImport() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    imported?: number;
    skipped?: number;
    skippedDetails?: ImportSkippedDetail[];
    skippedDetailsTruncated?: boolean;
    errors?: string[];
    message?: string;
  } | null>(null);
  const [copyReportDone, setCopyReportDone] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reviewStep, setReviewStep] = useState(false);
  const [unresolvedAccounts, setUnresolvedAccounts] = useState<string[]>([]);
  const [availableAccounts, setAvailableAccounts] = useState<Array<{ id: string; name: string; currency: string }>>([]);
  const [resolutions, setResolutions] = useState<
    Record<string, { action: 'none' | 'map' | 'keep_name'; accountId?: string }>
  >({});

  const sortedImportAccounts = useMemo(
    () =>
      [...availableAccounts].sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      ),
    [availableAccounts]
  );

  const importAccountIdSet = useMemo(
    () => new Set(availableAccounts.map((a) => a.id)),
    [availableAccounts]
  );

  /** Si una cuenta mapeada fue eliminada/desactivada, no dejar un id huérfano en el estado. */
  useEffect(() => {
    if (!reviewStep || unresolvedAccounts.length === 0) return;
    setResolutions((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const name of unresolvedAccounts) {
        const r = next[name];
        if (r?.action === 'map' && r.accountId && !importAccountIdSet.has(r.accountId)) {
          next[name] = { action: 'none', accountId: undefined };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [reviewStep, unresolvedAccounts, importAccountIdSet]);

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
          skippedDetails: result.skippedDetails,
          skippedDetailsTruncated: result.skippedDetailsTruncated,
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

                  {/* Excel multi-hoja / Airtable */}
                  <div>
                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                      📗 Excel (.xlsx / .xls) con varias hojas
                    </h4>
                    <p className="text-slate-600 dark:text-slate-400 mb-2">
                      Podés subir un libro con hojas <strong>Expenses</strong>, <strong>Income</strong> y <strong>Transfers</strong>. Se ignoran filas de título (p. ej. &quot;expenses list&quot;) hasta la fila de encabezados. En un solo archivo se importan <strong>gastos, ingresos y transferencias</strong>.
                    </p>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Gastos e ingresos — columnas típicas (inglés, como Airtable)
                    </p>
                    <div className="bg-white dark:bg-slate-800 rounded p-3 font-mono text-[10px] sm:text-xs overflow-x-auto leading-relaxed">
                      Date and time, Category, Account, Amount in default currency, Default currency, Amount in account currency, Account currency, Transaction amount in transaction currency, Transaction currency, Tags, Comment
                    </div>
                    <ul className="text-xs text-slate-600 dark:text-slate-400 mt-2 space-y-1 list-disc list-inside">
                      <li>
                        <strong>USD / moneda extranjera:</strong> si hay <strong>Transaction amount</strong> y <strong>Transaction currency</strong> (p. ej. 105,22 y USD), el movimiento se registra en esa moneda. El importe en <strong>Amount in account currency</strong> (p. ej. ARS) se usa como equivalente en cuenta. Si esas columnas van vacías, se usa solo el monto en moneda de cuenta.
                      </li>
                      <li>
                        La hoja <strong>Income</strong> usa las mismas columnas; el tipo de movimiento se toma del nombre de la hoja.
                      </li>
                    </ul>
                  </div>

                  {/* CSV Format */}
                  <div>
                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                      📊 CSV simple (Gasto / Ingreso por fila)
                    </h4>
                    <p className="text-slate-600 dark:text-slate-400 mb-2">
                      Creá un archivo con estas columnas. El orden no importa (coma o punto y coma):
                    </p>
                    <div className="bg-white dark:bg-slate-800 rounded p-3 font-mono text-xs overflow-x-auto">
                      <div className="text-slate-500">Fecha,Tipo,Monto,Moneda,Cuenta,Categoría,Descripción</div>
                      <div>03-01-2026,Gasto,5000,ARS,Efectivo ARS,Comida,Almuerzo</div>
                      <div>03-05-2026,Gasto,1500,ARS,Mercado Pago,Transporte,Uber</div>
                      <div>03-10-2026,Ingreso,850000,ARS,BBVA,Sueldo,Sueldo marzo</div>
                    </div>
                  </div>

                  {/* CSV transferencias entre cuentas */}
                  <div>
                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                      🔁 CSV transferencias (origen → destino)
                    </h4>
                    <p className="text-slate-600 dark:text-slate-400 mb-2">
                      Si el archivo incluye columnas de cuenta <strong>origen</strong> y <strong>destino</strong>, Zarix lo toma como transferencia real (con <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">destination_account_id</code>). Separador: coma o punto y coma.
                    </p>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Inglés (ejemplo de encabezados)</p>
                    <div className="bg-white dark:bg-slate-800 rounded p-3 font-mono text-[10px] sm:text-xs overflow-x-auto mb-3">
                      Date and time,Outgoing,Incoming,Amount in outgoing currency,Outgoing currency,Amount in incoming currency,Incoming currency,Comment
                    </div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Español (equivalente)</p>
                    <div className="bg-white dark:bg-slate-800 rounded p-3 font-mono text-[10px] sm:text-xs overflow-x-auto">
                      Fecha y hora,Origen,Destino,Monto en moneda origen,Moneda origen,Monto en moneda destino,Moneda destino,Comentario
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Origen</strong> y <strong>Destino</strong> deben coincidir con el nombre de tus cuentas. Montos: solo dígitos y punto decimal (sin miles). Fecha: <strong>DD/MM/YYYY</strong>, <strong>YYYY-MM-DD</strong> o ISO con hora. Los montos en destino son opcionales; si hay cruce de monedas, se agregan al comentario.
                    </p>
                  </div>

                  {/* Column mapping */}
                  <div>
                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                      🔗 Mapeo de columnas (CSV simple)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Fecha *</span>
                        <span className="text-slate-500">
                          <strong>YYYY-MM-DD</strong> (recomendado), <strong>DD/MM/YYYY</strong> o ISO con hora. Sin hora, se toma el día calendario (no se corre por zona horaria).
                        </span>
                      </div>
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Monto *</span>
                        <span className="text-slate-500">1000 o 1000.50 (punto o coma decimal)</span>
                      </div>
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Tipo</span>
                        <span className="text-slate-500">Gasto, Ingreso (no transferencias)</span>
                      </div>
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Moneda</span>
                        <span className="text-slate-500">ARS, USD (default: ARS)</span>
                      </div>
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Cuenta</span>
                        <span className="text-slate-500">
                          Igual al nombre en Zarix (mayúsculas y tildes no importan)
                        </span>
                      </div>
                      <div className="flex justify-between p-2 bg-white dark:bg-slate-800 rounded">
                        <span className="font-medium">Categoría</span>
                        <span className="text-slate-500">
                          Opcional; debe coincidir con una categoría tuya o del sistema (misma regla de
                          tildes); si no hay match, sin categoría
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">* Campos obligatorios en CSV simple</p>
                  </div>

                  {/* Cuentas no encontradas */}
                  <div>
                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                      🏦 Cuentas que no coinciden
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      Si el nombre de cuenta del archivo no existe en Zarix, podés elegir por cada una:
                    </p>
                    <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                      <li><strong>Asignar a cuenta existente:</strong> mapeá el nombre importado a una cuenta que ya tenés.</li>
                      <li><strong>Dejar sin cuenta:</strong> se importa el movimiento sin <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">account_id</code> (podés editarlo después).</li>
                      <li><strong>Guardar nombre original en notas:</strong> se anota el texto de la cuenta en las notas del movimiento.</li>
                      <li>Si no hay nombre de cuenta pero sí moneda, a veces se sugiere una cuenta con esa moneda (solo como ayuda).</li>
                    </ul>
                    <p className="text-xs text-slate-500 mt-2">
                      Las <strong>transferencias</strong> exigen resolver origen y destino; si falta una cuenta, esa fila se omite.
                    </p>
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
    "amount": 105.22,
    "currency": "USD",
    "amount_in_account_currency": 147160.84,
    "account": "Tarjeta USD",
    "category": "Comida",
    "description": "Compra exterior"
  }
]`}</pre>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">amount_in_account_currency</code> es opcional: sirve cuando el monto principal está en una moneda y querés guardar el equivalente en moneda de cuenta (como en Excel con USD + ARS).
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      Valores de type: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">expense</code>, <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">income</code>. Para transferencias entre cuentas usá el <strong>CSV o hoja Transfers</strong> con Origen/Destino, no <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">transfer</code> en el CSV simple.
                    </p>
                  </div>

                  {/* Tips */}
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                    <h4 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">
                      💡 Tips importantes
                    </h4>
                    <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
                      <li>Los <strong>nombres de cuenta</strong> deben coincidir con Zarix (o usá la pantalla de revisión para mapearlos)</li>
                      <li>Archivos <strong>.xlsx</strong>: se leen directo; para <strong>.csv</strong> conviene exportar como <strong>CSV UTF-8</strong> para acentos</li>
                      <li>Evitá separador de miles en montos (usá 5000 o 5000.50; también aceptamos 5.000,50 con coma decimal)</li>
                      <li><strong>Categorías</strong> inexistentes se omiten (el movimiento igual se importa)</li>
                      <li>Import grande: el límite práctico es el tamaño del archivo y el tiempo del servidor (podés partir en varios archivos si falla)</li>
                    </ul>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.json,.xlsx,.xls"
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
            <span>{importing ? 'Importando...' : 'Seleccionar CSV, Excel (.xlsx) o JSON'}</span>
          </label>

          <p className="text-xs text-slate-500 mt-2">
              Aceptamos .csv, .xlsx / .xls y .json (mismas columnas que el CSV de ejemplo)
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
                            value={
                              current.accountId && importAccountIdSet.has(current.accountId)
                                ? current.accountId
                                : ''
                            }
                            onChange={(e) =>
                              setResolutions((prev) => ({
                                ...prev,
                                [name]: { ...prev[name], accountId: e.target.value },
                              }))
                            }
                          >
                            <option value="">Seleccionar cuenta...</option>
                            {sortedImportAccounts.map((a) => (
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
              <div className="space-y-3">
                <p className="font-medium text-green-700 dark:text-green-400">
                  ✅ Importación completada
                </p>
                <p className="text-sm text-green-600 dark:text-green-500">
                  {importResult.imported} transacciones importadas
                  {importResult.skipped != null && importResult.skipped > 0 && (
                    <span className="text-amber-700 dark:text-amber-300">
                      {`, ${importResult.skipped} omitidas`}
                    </span>
                  )}
                </p>

                {importResult.skipped != null && importResult.skipped > 0 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <p className="font-medium text-amber-900 dark:text-amber-200">
                        Filas omitidas — por qué y cómo corregirlas
                      </p>
                      {(importResult.skippedDetails?.length ?? 0) > 0 && (
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded-md border border-amber-300 dark:border-amber-600 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                          onClick={() => {
                            const lines = importResult.skippedDetails!.map((d) => {
                              const ctx = d.context ? `\n  Contexto: ${d.context}` : '';
                              return `${d.title}\n  Por qué: ${d.reason}\n  Qué hacer: ${d.suggestion}${ctx}`;
                            });
                            const head =
                              importResult.skippedDetailsTruncated === true
                                ? `Informe parcial (${lines.length} de ${importResult.skipped} omitidas).\n\n`
                                : '';
                            void navigator.clipboard.writeText(head + lines.join('\n\n'));
                            setCopyReportDone(true);
                            setTimeout(() => setCopyReportDone(false), 2500);
                          }}
                        >
                          {copyReportDone ? 'Copiado' : 'Copiar informe al portapapeles'}
                        </button>
                      )}
                    </div>
                    {importResult.skippedDetailsTruncated === true && (
                      <p className="text-xs text-amber-800 dark:text-amber-400 mb-2">
                        Se listan las primeras omisiones con detalle; el total omitido es mayor.
                      </p>
                    )}
                    {importResult.skippedDetails && importResult.skippedDetails.length > 0 ? (
                      <ul className="space-y-3 text-amber-950 dark:text-amber-100">
                        {importResult.skippedDetails.map((d, i) => (
                          <li
                            key={i}
                            className="border-l-2 border-amber-400 dark:border-amber-600 pl-3"
                          >
                            <div className="font-medium text-amber-950 dark:text-amber-50">{d.title}</div>
                            <div className="text-xs mt-1 text-amber-900/90 dark:text-amber-200/90">
                              <span className="text-amber-700 dark:text-amber-400">Motivo:</span> {d.reason}
                            </div>
                            <div className="text-xs mt-1 text-amber-900/90 dark:text-amber-200/90">
                              <span className="text-amber-700 dark:text-amber-400">Cómo evitarlo:</span>{' '}
                              {d.suggestion}
                            </div>
                            {d.context && (
                              <div className="text-[11px] mt-1 text-amber-800/80 dark:text-amber-300/80 font-mono">
                                {d.context}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-amber-800 dark:text-amber-400">
                        No hay detalle por fila (revisá la consola del servidor o reintentá). Total omitidas:{' '}
                        {importResult.skipped}.
                      </p>
                    )}
                  </div>
                )}

                {importResult.errors && importResult.errors.length > 0 && !importResult.skippedDetails?.length && (
                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    <p className="font-medium">Advertencias:</p>
                    <ul className="list-disc list-inside">
                      {importResult.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
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
