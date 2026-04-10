export const SESSION_COOKIE = 'pseo-session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── HMAC-SHA256 using Web Crypto API (Edge-compatible) ────────────────────────

async function hmacSign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  // Compare lengths separately to avoid short-circuit
  const lengthOk = ea.length === eb.length ? 1 : 0;
  const len = Math.max(ea.length, eb.length);
  let diff = 0;
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return lengthOk === 1 && diff === 0;
}

// ── Session token: base64(payload).signature ──────────────────────────────────

export async function createSessionToken(username: string): Promise<string> {
  const secret = process.env.AUTH_SECRET!;
  const payload = btoa(JSON.stringify({ u: username, t: Date.now() }));
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !token) return false;

  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const payload = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);

  try {
    const expectedSig = await hmacSign(payload, secret);
    if (!timingSafeEqual(sig, expectedSig)) return false;

    const { t } = JSON.parse(atob(payload)) as { u: string; t: number };
    return Date.now() - t < SESSION_DURATION_MS;
  } catch {
    return false;
  }
}

// ── Credential validation (timing-safe) ──────────────────────────────────────

export function validateCredentials(username: string, password: string): boolean {
  const validUser = process.env.AUTH_USERNAME ?? '';
  const validPass = process.env.AUTH_PASSWORD ?? '';
  return (
    timingSafeEqual(username, validUser) &&
    timingSafeEqual(password, validPass)
  );
}
