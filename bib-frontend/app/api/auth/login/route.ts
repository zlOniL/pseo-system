import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, validateCredentials, SESSION_COOKIE } from '@/lib/auth';

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
const IS_PROD = process.env.NODE_ENV === 'production';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.AUTH_SECRET || !process.env.AUTH_USERNAME || !process.env.AUTH_PASSWORD) {
      return NextResponse.json(
        { error: 'Servidor não configurado (variáveis AUTH_* em falta no .env.local)' },
        { status: 500 },
      );
    }

    const { username, password } = (await request.json()) as {
      username: string;
      password: string;
    };

    if (!validateCredentials(username ?? '', password ?? '')) {
      // Fixed delay to prevent brute-force timing inference
      await new Promise((r) => setTimeout(r, 500));
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    const token = await createSessionToken(username);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: IS_PROD,       // false in local dev (HTTP), true in production (HTTPS)
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
