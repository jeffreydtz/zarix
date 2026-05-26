'use client';

import { Globe, Linkedin, Mail, X } from 'lucide-react';
import { useState } from 'react';

export default function Footer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 text-sm text-[#8B949E] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-bold text-[#F8F9FA]">Zarix</p>
              <p className="mt-1">© 2026 Zarix · Hecho en Argentina 🇦🇷</p>
            </div>
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="transition hover:text-[#F8F9FA]"
              >
                Contacto
              </button>
            </div>
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-[#6F7682]">
            Las cotizaciones (dólar blue, MEP, CCL, acciones, CEDEARs, bonos, cripto) provienen de fuentes públicas
            (DolarApi, data912.com, CoinGecko, Yahoo Finance) y se muestran con fines informativos. Pueden tener
            demoras o errores y no constituyen recomendación de inversión. Zarix no opera mercados ni custodia
            activos: registrás tus propias tenencias y movimientos.
          </p>
        </div>
      </footer>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-label="Contacto de Jeffrey Dietz">
          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0F1117] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar modal de contacto"
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#8B949E] transition hover:text-[#F8F9FA]"
            >
              <X size={16} />
            </button>

            <h3 className="text-xl font-semibold text-[#F8F9FA]">Contacto</h3>
            <p className="mt-1 text-sm text-[#8B949E]">Jeffrey Dietz</p>

            <div className="mt-5 space-y-3">
              <a
                href="mailto:jef_dietz@hotmail.com"
                className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-[#F8F9FA] transition hover:border-white/[0.18]"
              >
                <Mail size={16} className="text-blue-400" />
                <span>jef_dietz@hotmail.com</span>
              </a>

              <a
                href="https://www.linkedin.com/in/jeffrey--dietz"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-[#F8F9FA] transition hover:border-white/[0.18]"
              >
                <Linkedin size={16} className="text-blue-400" />
                <span>LinkedIn</span>
              </a>

              <a
                href="https://jeffrey-dietz-portfolio.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-[#F8F9FA] transition hover:border-white/[0.18]"
              >
                <Globe size={16} className="text-blue-400" />
                <span>Portfolio personal</span>
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
