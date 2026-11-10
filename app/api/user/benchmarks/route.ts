import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse, requireUser } from '@/lib/api-handler';
import { assertSameOrigin } from '@/lib/auth/origin';
import {
  loadUserBenchmarkSettings,
  saveUserBenchmarkSettings,
} from '@/lib/services/benchmarks';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  plazo_fijo_tna: z.number().min(0).max(400).nullable().optional(),
  plazo_fijo_label: z.string().max(80).nullable().optional(),
  caucion_tna: z.number().min(0).max(400).nullable().optional(),
  caucion_label: z.string().max(80).nullable().optional(),
  fci_mm_ticker: z.string().max(32).nullable().optional(),
}).strict();

export async function GET() {
  try {
    const { user } = await requireUser();
    return NextResponse.json(await loadUserBenchmarkSettings(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    const { user } = await requireUser();
    assertSameOrigin(req);
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('Benchmark inválido. TNA 0–400 y ticker CAFCI opcional.', 400);
    }
    const saved = await saveUserBenchmarkSettings(user.id, parsed.data);
    return NextResponse.json(saved);
  } catch (error) {
    return errorResponse(error);
  }
}
