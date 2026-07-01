import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { verifyCronBearer } from '@/lib/cron-auth';

export type ServiceClient = ReturnType<typeof createServiceClientSync>;

/**
 * Patrón Template Method (GoF) para los cron jobs de app/api/cron/**.
 *
 * `run()` fija el esqueleto común a todos los jobs (validar el bearer de
 * Vercel Cron, crear el service client, envolver errores en una respuesta
 * JSON uniforme) y delega el trabajo específico en `execute()`.
 *
 * Instanciar un job NUEVO por request (`new XxxJob().run(request)`): las
 * subclases pueden guardar estado por corrida y Vercel puede reutilizar el
 * módulo entre invocaciones (Fluid Compute).
 */
export abstract class CronJob {
  /** Nombre del job, usado en logs y en la respuesta. */
  abstract readonly name: string;

  /** Template method: NO redefinir en subclases. */
  async run(request: NextRequest): Promise<NextResponse> {
    const authHeader = request.headers.get('authorization');
    if (!verifyCronBearer(authHeader, process.env.CRON_SECRET)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClientSync();

    try {
      const payload = await this.execute(supabase);
      return NextResponse.json({ success: true, job: this.name, ...payload });
    } catch (e) {
      console.error(`[cron:${this.name}] error:`, e);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
  }

  /** Operación primitiva: el trabajo propio del job. */
  protected abstract execute(supabase: ServiceClient): Promise<Record<string, unknown>>;
}

/**
 * Variante iterativa del template: fetch → filtrar → procesar de a uno
 * (un error en un ítem no corta el lote) → resumen con contadores.
 * Cubre los jobs que recorren filas (reglas recurrentes, inversiones, usuarios).
 */
export abstract class IterativeCronJob<TItem> extends CronJob {
  protected async execute(supabase: ServiceClient): Promise<Record<string, unknown>> {
    let items: TItem[];
    try {
      items = await this.fetchItems(supabase);
    } catch (e) {
      console.error(`[cron:${this.name}] fetch error:`, e);
      throw e;
    }

    if (items.length === 0) {
      return { total: 0, processed: 0, errors: 0, message: this.emptyMessage() };
    }

    await this.beforeAll(supabase, items);

    let processed = 0;
    let errors = 0;

    for (const item of items) {
      if (!(await this.shouldProcess(item))) continue;
      try {
        const done = await this.processItem(supabase, item);
        if (done !== false) processed++;
      } catch (e) {
        console.error(`[cron:${this.name}] item error:`, e);
        errors++;
      }
    }

    await this.afterAll(supabase, items);

    return { total: items.length, processed, errors };
  }

  /** Operación primitiva: qué filas procesa este job. */
  protected abstract fetchItems(supabase: ServiceClient): Promise<TItem[]>;

  /**
   * Operación primitiva: procesa un ítem. Devolver `false` para marcarlo
   * como salteado (no suma al contador `processed`).
   */
  protected abstract processItem(supabase: ServiceClient, item: TItem): Promise<boolean | void>;

  /** Hook: filtro previo por ítem (default: procesar todos). */
  protected shouldProcess(_item: TItem): boolean | Promise<boolean> {
    return true;
  }

  /** Hook: preparación por lote (ej. precargar precios) antes de iterar. */
  protected async beforeAll(_supabase: ServiceClient, _items: TItem[]): Promise<void> {}

  /** Hook: trabajo por lote después de iterar (ej. persistir histórico). */
  protected async afterAll(_supabase: ServiceClient, _items: TItem[]): Promise<void> {}

  /** Hook: mensaje cuando no hay filas para procesar. */
  protected emptyMessage(): string {
    return 'Nothing to process';
  }
}
