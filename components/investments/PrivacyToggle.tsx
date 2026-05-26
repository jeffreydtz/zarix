'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useInvestmentsPrivacy } from '@/lib/hooks/use-investments-privacy';

interface PrivacyToggleProps {
  className?: string;
}

export default function PrivacyToggle({ className }: PrivacyToggleProps) {
  const { hidden, toggle } = useInvestmentsPrivacy();
  const Icon = hidden ? EyeOff : Eye;
  const label = hidden ? 'Mostrar montos' : 'Ocultar montos';

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        className ??
        'inline-flex items-center justify-center gap-1.5 rounded-control border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-soft transition-colors'
      }
      title={label}
      aria-label={label}
      aria-pressed={hidden}
    >
      <Icon size={14} aria-hidden />
      <span className="hidden sm:inline">{hidden ? 'Mostrar' : 'Ocultar'}</span>
    </button>
  );
}
