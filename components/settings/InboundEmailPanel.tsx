'use client';

import { useCallback, useEffect, useState } from 'react';

type Mailbox = {
  configured: boolean;
  domain: string | null;
  address: string | null;
  tokenPrefix: string | null;
  createdAt: string | null;
  webhookConfigured: boolean;
};

export default function InboundEmailPanel() {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/user/inbound-email');
    const data = await res.json().catch(() => ({}));
    setMailbox(data.mailbox ?? null);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const issue = async () => {
    setLoading(true);
    setMessage('');
    setFreshToken(null);
    try {
      const res = await fetch('/api/user/inbound-email', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || 'No se pudo crear el buzón.');
        return;
      }
      setFreshToken(data.token || null);
      setMailbox(data.mailbox ?? null);
      setMessage(data.warning || 'Buzón listo. Reenviá mails acá; confirmá en Pendientes.');
    } finally {
      setLoading(false);
    }
  };

  const revoke = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/user/inbound-email', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || 'No se pudo revocar.');
        return;
      }
      setFreshToken(null);
      await load();
      setMessage('Buzón revocado.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setMessage('Copiado.');
  };

  return (
    <section className="card space-y-3">
      <h2 className="text-xl font-semibold">Mails de Mercado Pago y bancos</h2>
      <p className="text-sm text-muted-foreground">
        Reenviá el mail del resumen o del aviso a tu dirección Zarix. El webhook genérico (Resend inbound u otro
        proveedor) deja los movimientos en Pendientes. No se crea ninguna cuenta de proveedor desde la app: hace falta
        configurar <code className="text-foreground">INBOUND_EMAIL_WEBHOOK_SECRET</code> y, si usás dominio propio,
        <code className="text-foreground">INBOUND_EMAIL_DOMAIN</code>.
      </p>
      {!mailbox?.webhookConfigured && (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          El webhook todavía no está configurado en este entorno. Podés generar el token igual; los mails no se
          reciben hasta que exista el secreto.
        </p>
      )}
      {mailbox?.address && (
        <p className="text-sm">
          Dirección:{' '}
          <code className="text-foreground">{mailbox.address}</code>
        </p>
      )}
      {freshToken && mailbox?.domain && (
        <p className="text-sm">
          Dirección completa:{' '}
          <code className="break-all text-foreground">{`${freshToken}@${mailbox.domain}`}</code>
        </p>
      )}
      {freshToken && !mailbox?.domain && (
        <p className="text-sm">
          Token de buzón (para el JSON genérico <code>mailboxToken</code>):{' '}
          <code className="break-all text-foreground">{freshToken}</code>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={loading} onClick={issue}>
          {mailbox?.tokenPrefix ? 'Regenerar dirección' : 'Generar dirección'}
        </button>
        {mailbox?.tokenPrefix && (
          <button type="button" className="text-sm text-destructive" disabled={loading} onClick={revoke}>
            Revocar
          </button>
        )}
        {mailbox?.address && (
          <button type="button" className="text-sm text-primary" onClick={() => copy(mailbox.address!)}>
            Copiar dirección
          </button>
        )}
      </div>
      {message && <p className="text-sm text-foreground">{message}</p>}
    </section>
  );
}
