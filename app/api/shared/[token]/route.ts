import { NextRequest, NextResponse } from 'next/server';
import { sharedExpensesService, isValidShareToken } from '@/lib/services/sharedExpenses';

// Acceso público por token (link compartible). El token de 32 hex chars
// actúa como capability: sin token válido no hay datos.

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    if (!isValidShareToken(params.token)) {
      return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
    }

    const detail = await sharedExpensesService.getGroupByToken(params.token);
    if (!detail) {
      return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error: any) {
    console.error('Shared group by token GET error:', error);
    return NextResponse.json(
      { error: 'Error al obtener el grupo compartido' },
      { status: 500 }
    );
  }
}

// Unirse al grupo como invitado (sin cuenta): nombre + email o teléfono.
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    if (!isValidShareToken(params.token)) {
      return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
    }

    const body = await req.json();
    const displayName =
      typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 60) : '';
    const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;
    const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;

    if (!displayName) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }
    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Ingresá un email o un teléfono para identificarte' },
        { status: 400 }
      );
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
    }
    if (phone && !/^[0-9+\-() ]{6,25}$/.test(phone)) {
      return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 });
    }

    const member = await sharedExpensesService.addMemberByToken(params.token, {
      displayName,
      email,
      phone,
    });
    if (!member) {
      return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });
    }

    return NextResponse.json(member, { status: 201 });
  } catch (error: any) {
    console.error('Shared group join POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al unirse al grupo' },
      { status: 500 }
    );
  }
}
