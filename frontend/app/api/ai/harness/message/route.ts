import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Harness turns can include several provider round-trips and exceed Next's
// default rewrite proxy timeout. Keep this same-origin endpoint open long enough
// for the configured AI request timeout to complete.
export const maxDuration = 200;

const BACKEND_URL = process.env.BACKEND_API_URL || `${process.env.BACKEND_URL || 'http://127.0.0.1:5000'}/api`;
const UPSTREAM_URL = `${BACKEND_URL.replace(/\/$/, '')}/ai/harness/message`;
const UPSTREAM_TIMEOUT_MS = 190_000;

export async function POST(request: NextRequest) {
  let upstream: Response;
  try {
    const headers = new Headers({ 'content-type': request.headers.get('content-type') || 'application/json' });
    for (const name of ['authorization', 'accept', 'x-request-id']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers,
      body: await request.arrayBuffer(),
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError'
      ? 'AI request timed out while waiting for the backend.'
      : 'Could not reach the AI backend.';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);
  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) responseHeaders.set('retry-after', retryAfter);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
