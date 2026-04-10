import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, validateCredentials, SESSION_COOKIE } from '@/lib/auth';

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export async function POST(request: NextRequest) {
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
    secure: true,
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  return response;
}
