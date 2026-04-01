import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { categoriesService } from '@/lib/services/categories';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const categories = await categoriesService.list(user.id);
    return NextResponse.json(categories);
  } catch (error: any) {
    console.error('Categories GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener las categorías' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    const category = await categoriesService.create({
      userId: user.id,
      name: body.name,
      type: body.type,
      icon: body.icon || '🔁',
      parentId: body.parentId,
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    console.error('Categories POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al crear la categoría' },
      { status: 500 }
    );
  }
}
