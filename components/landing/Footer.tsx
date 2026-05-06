import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-[#8B949E] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div>
          <p className="text-base font-bold text-[#F8F9FA]">Zarix</p>
          <p className="mt-1">© 2025 Zarix · Hecho en Argentina 🇦🇷</p>
        </div>
        <div className="flex items-center gap-5">
          <Link href="#" className="transition hover:text-[#F8F9FA]">
            Terminos
          </Link>
          <Link href="#" className="transition hover:text-[#F8F9FA]">
            Privacidad
          </Link>
          <Link href="#" className="transition hover:text-[#F8F9FA]">
            Contacto
          </Link>
        </div>
      </div>
    </footer>
  );
}
