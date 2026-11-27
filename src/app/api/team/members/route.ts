import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_ROLES = new Set(['admin', 'veterinarian', 'operator']);

async function requireActiveAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 }) };
  }

  const { data: membership, error: memberError } = await supabase
    .from('organization_members')
    .select('id, organization_id, role, status')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memberError || !membership) {
    return { error: NextResponse.json({ success: false, error: 'Organização não encontrada.' }, { status: 403 }) };
  }

  if (membership.status !== 'active' || membership.role !== 'admin') {
    return {
      error: NextResponse.json(
        { success: false, error: 'Apenas administradores ativos podem gerenciar a equipe.' },
        { status: 403 }
      ),
    };
  }

  return { supabase, user, membership };
}

export async function POST(request: Request) {
  const auth = await requireActiveAdmin();
  if ('error' in auth && auth.error) return auth.error;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Configuração server-side ausente: defina SUPABASE_SERVICE_ROLE_KEY no servidor para criar membros com segurança.',
      },
      { status: 503 }
    );
  }

  let body: { name?: string; email?: string; password?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido.' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const role = (body.role || 'operator').trim();

  if (!name || !email || !email.includes('@')) {
    return NextResponse.json({ success: false, error: 'Nome e e-mail válido são obrigatórios.' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { success: false, error: 'A senha deve conter no mínimo 8 caracteres.' },
      { status: 400 }
    );
  }

  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ success: false, error: 'Papel inválido.' }, { status: 400 });
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Cria novo usuário via Admin API sem sobrescrever contas existentes e sem disparar onboarding duplicado
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, display_name: name, skip_onboarding: true },
  });

  if (createErr || !created?.user) {
    const msg =
      createErr?.message?.toLowerCase().includes('already') || createErr?.message?.toLowerCase().includes('registered')
        ? 'Já existe uma conta cadastrada com este e-mail. Por segurança, não é permitido redefinir a senha de contas existentes por este fluxo.'
        : createErr?.message || 'Erro ao criar conta do colaborador.';
    return NextResponse.json({ success: false, error: msg }, { status: 409 });
  }

  const { error: linkErr } = await admin.from('organization_members').upsert(
    {
      organization_id: auth.membership.organization_id,
      user_id: created.user.id,
      role,
      display_name: name,
      email,
      status: 'active',
    },
    { onConflict: 'organization_id,user_id' }
  );

  if (linkErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json(
      { success: false, error: `Usuário criado, mas falhou ao vincular à equipe: ${linkErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, user_id: created.user.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireActiveAdmin();
  if ('error' in auth && auth.error) return auth.error;

  let body: { memberId?: string; role?: string; status?: 'active' | 'inactive' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido.' }, { status: 400 });
  }

  if (!body.memberId) {
    return NextResponse.json({ success: false, error: 'memberId é obrigatório.' }, { status: 400 });
  }

  const updatePayload: Record<string, string> = {};
  if (body.role !== undefined) {
    if (!ALLOWED_ROLES.has(body.role)) {
      return NextResponse.json({ success: false, error: 'Papel inválido.' }, { status: 400 });
    }
    updatePayload.role = body.role;
  }
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'inactive') {
      return NextResponse.json({ success: false, error: 'Status inválido.' }, { status: 400 });
    }
    updatePayload.status = body.status;
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ success: false, error: 'Nenhuma alteração informada.' }, { status: 400 });
  }

  // Impede que o último administrador ativo se rebaixe ou se desative
  if (
    body.memberId === auth.membership.id &&
    (updatePayload.status === 'inactive' || (updatePayload.role && updatePayload.role !== 'admin'))
  ) {
    const { count } = await auth.supabase
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', auth.membership.organization_id)
      .eq('role', 'admin')
      .eq('status', 'active');

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { success: false, error: 'Não é possível remover ou inativar o único administrador ativo da organização.' },
        { status: 400 }
      );
    }
  }

  const { data: updatedMember, error } = await auth.supabase
    .from('organization_members')
    .update(updatePayload)
    .eq('id', body.memberId)
    .eq('organization_id', auth.membership.organization_id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (!updatedMember) {
    return NextResponse.json({ success: false, error: 'Membro não encontrado nesta organização.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
