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

    if (body.parentId) {
      if (body.parentId === params.id) {
        return NextResponse.json(
          { error: 'Una categoría no puede ser su propia categoría padre' },
          { status: 400 }
        );
      }

      // La categoría padre debe ser del usuario (o del sistema, visibles para todos).
      const { data: parent } = await supabase
        .from('categories')
        .select('id, parent_id')
        .eq('id', body.parentId)
        .or(`user_id.eq.${user.id},is_system.eq.true`)
        .maybeSingle();
      if (!parent) {
        return NextResponse.json({ error: 'Categoría padre inválida' }, { status: 400 });
      }

      // Anti-ciclo: la cadena de padres del nuevo padre no puede incluir a esta categoría.
      let ancestorId: string | null = parent.parent_id;
      for (let depth = 0; ancestorId && depth < 20; depth++) {
        if (ancestorId === params.id) {
          return NextResponse.json(
            { error: 'La categoría padre genera un ciclo de categorías' },
            { status: 400 }
          );
        }
        const { data: ancestor } = await supabase
          .from('categories')
          .select('parent_id')
          .eq('id', ancestorId)
          .maybeSingle();
        ancestorId = ancestor?.parent_id ?? null;
      }
    }

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
