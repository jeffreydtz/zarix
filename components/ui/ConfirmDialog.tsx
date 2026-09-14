'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

type DialogState = ConfirmOptions & { open: boolean };

const CLOSED: DialogState = {
  open: false,
  title: '',
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(CLOSED);
  const resolveRef = useRef<((value: boolean) => void) | undefined>(undefined);
  useBodyScrollLock(state.open);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        open: true,
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        danger: options.danger,
      });
    });
  }, []);

  const finish = useCallback((value: boolean) => {
    setState(CLOSED);
    resolveRef.current?.(value);
    resolveRef.current = undefined;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) finish(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="zx-confirm-title"
            className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl"
          >
            <h2 id="zx-confirm-title" className="text-lg font-semibold text-foreground">
              {state.title}
            </h2>
            {state.description ? (
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {state.description}
              </p>
            ) : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-secondary py-3 text-sm font-medium text-foreground"
                onClick={() => finish(false)}
              >
                {state.cancelLabel || 'Cancelar'}
              </button>
              <button
                type="button"
                className={`flex-1 rounded-xl py-3 text-sm font-semibold ${
                  state.danger
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-primary text-primary-foreground'
                }`}
                onClick={() => finish(true)}
              >
                {state.confirmLabel || (state.danger ? 'Eliminar' : 'Confirmar')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  return useMemo(() => {
    if (ctx) return ctx;
    return async (options) =>
      typeof window !== 'undefined' ? window.confirm([options.title, options.description].filter(Boolean).join('\n\n')) : false;
  }, [ctx]);
}
