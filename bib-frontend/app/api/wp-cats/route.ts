import { NextRequest, NextResponse } from 'next/server';

const WP_BASE_URL = process.env.WP_BASE_URL ?? '';
const WP_SECRET = process.env.WP_SECRET ?? '';

export async function GET() {
  if (!WP_BASE_URL || !WP_SECRET) {
    return NextResponse.json({ error: 'WP_BASE_URL or WP_SECRET not configured' }, { status: 500 });
  }

  const url = `${WP_BASE_URL}/wp-json/custom/v1/wp-cats`;

  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        Authorization: `Bearer ${WP_SECRET}`,
      },
      cache: 'no-store',
    });

    const body = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: body }, { status: res.status });
    }

    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!WP_BASE_URL || !WP_SECRET) {
    return NextResponse.json({ error: 'WP_BASE_URL or WP_SECRET not configured' }, { status: 500 });
  }

  const url = `${WP_BASE_URL}/wp-json/custom/v1/wp-cats`;
  const body = await request.json() as unknown;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        Authorization: `Bearer ${WP_SECRET}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const resBody = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: resBody }, { status: res.status });
    }

    return new NextResponse(resBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
