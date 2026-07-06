import { NextRequest, NextResponse } from 'next/server';

const WP_BASE_URL = (process.env.WP_BASE_URL ?? '').replace(/\/$/, '');
const WP_SECRET = process.env.WP_SECRET ?? '';

function describeFetchError(err: unknown): string {
  const error = err as Error & {
    code?: string;
    cause?: {
      code?: string;
      message?: string;
      hostname?: string;
      host?: string;
      port?: string | number;
    };
  };
  const cause = error.cause;
  const details = [
    error.message,
    cause?.code,
    cause?.message,
    cause?.hostname ?? cause?.host,
    cause?.port ? `port ${cause.port}` : undefined,
    error.code,
  ].filter(Boolean);

  return [...new Set(details)].join(' | ') || 'Unknown fetch error';
}

function buildWpUrl(pathSegments: string[], searchParams: URLSearchParams): string {
  const path = pathSegments.join('/');
  const qs = searchParams.toString();
  return `${WP_BASE_URL}/wp-json/custom/v1/${path}${qs ? `?${qs}` : ''}`;
}

async function proxy(request: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  if (!WP_BASE_URL || !WP_SECRET) {
    return NextResponse.json({ error: 'WP_BASE_URL or WP_SECRET not configured' }, { status: 500 });
  }

  // Validate that the caller is the Render backend using WP_SECRET
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${WP_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const wpUrl = buildWpUrl(pathSegments, request.nextUrl.searchParams);
  const method = request.method;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    Authorization: `Bearer ${WP_SECRET}`,
  };

  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? await request.text() : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    console.log(`[wp-proxy] ${method} ${wpUrl}`);
    const res = await fetch(wpUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
      signal: controller.signal,
    });
    const resBody = await res.text();
    if (!res.ok) {
      console.error(`[wp-proxy] ${res.status} from ${wpUrl}: ${resBody.slice(0, 300)}`);
    }
    return new NextResponse(resBody, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const detail = describeFetchError(err);
    console.error(`[wp-proxy] fetch error to ${wpUrl}: ${detail}`, err);
    return NextResponse.json({ error: `WordPress proxy fetch failed: ${detail}` }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxy(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxy(request, path);
}
