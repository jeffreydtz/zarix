'use client';

import { AlertCircle, Bug, Send, X } from 'lucide-react';
import { useMemo, useState } from 'react';

type Severity = 'Bajo' | 'Medio' | 'Alto' | 'Critico';

const SUPPORT_EMAIL = 'jef_dietz@hotmail.com';

export default function BugReportWidget() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [steps, setSteps] = useState('');
  const [severity, setSeverity] = useState<Severity>('Medio');

  const canSend = useMemo(() => title.trim().length > 3 && details.trim().length > 8, [title, details]);

  const handleSend = () => {
    if (!canSend) return;

    const now = new Date().toISOString();
    const page = typeof window !== 'undefined' ? window.location.href : 'N/A';
    const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : 'N/A';

    const subject = `[Zarix Bug] ${title.trim()}`;
    const body = [
      `Severidad: ${severity}`,
      `Pagina: ${page}`,
      `Fecha: ${now}`,
      '',
      'Descripcion:',
      details.trim(),
      '',
      'Pasos para reproducir:',
      steps.trim() || 'No especificado',
      '',
      `User Agent: ${userAgent}`,
    ].join('\n');

    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Reportar bug"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[90] inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#0F1117]/95 px-3 py-2 text-sm font-medium text-[#F8F9FA] shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl transition hover:border-white/20"
      >
        <Bug size={16} className="text-blue-400" />
        Reportar bug
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Reportar problema en Zarix">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0F1117] p-5 text-[#F8F9FA] shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">Contanos que se rompio</p>
                <p className="mt-1 text-sm text-[#8B949E]">Vamos a abrir tu mail con el reporte listo para enviar.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar reporte de bug"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#8B949E] transition hover:text-[#F8F9FA]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-[#8B949E]" htmlFor="bug-title">
                  Titulo corto
                </label>
                <input
                  id="bug-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: No carga el dashboard"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none transition focus:border-blue-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#8B949E]" htmlFor="bug-details">
                  Que paso?
                </label>
                <textarea
                  id="bug-details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={4}
                  placeholder="Explica brevemente el error"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none transition focus:border-blue-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#8B949E]" htmlFor="bug-steps">
                  Como lo reproduzco?
                </label>
                <textarea
                  id="bug-steps"
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  rows={3}
                  placeholder="Paso 1... Paso 2..."
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none transition focus:border-blue-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#8B949E]" htmlFor="bug-severity">
                  Severidad
                </label>
                <select
                  id="bug-severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none transition focus:border-blue-400"
                >
                  <option value="Bajo">Bajo</option>
                  <option value="Medio">Medio</option>
                  <option value="Alto">Alto</option>
                  <option value="Critico">Critico</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-xs text-[#8B949E]">
                <AlertCircle size={14} />
                Se adjunta pagina, fecha y navegador automaticamente.
              </div>
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={14} />
                Enviar reporte
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
