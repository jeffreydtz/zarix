import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { categoriesService } from '@/lib/services/categories';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const category = await categoriesService.getById(params.id, user.id);
    return NextResponse.json(category);
  } catch (error: any) {
    console.error('Category GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Categoría no encontrada' },
      { status: 404 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    const category = await categoriesService.update(params.id, user.id, body);
    return NextResponse.json(category);
  } catch (error: any) {
    console.error('Category PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar la categoría' },
      { status: 500 }
    );
  }
}

export const PUT = PATCH;

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await categoriesService.delete(params.id, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Category DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al eliminar la categoría' },
      { status: 500 }
    );
  }
}
