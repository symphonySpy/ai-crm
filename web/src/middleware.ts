import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Must match SESSION_COOKIE in api/src/middleware/auth.js.
const SESSION_COOKIE = 'ai_crm_session';

const PUBLIC_PATHS = ['/login'];

/**
 * Decides where an unauthenticated visitor lands, before any page renders.
 *
 * Without this, opening / sent the browser to /leads, which rendered the whole shell,
 * asked the API for data, got 401, and only then redirected to /login — so the first
 * thing a signed-out visitor saw was an empty pipeline flashing past. Doing it here
 * means the redirect happens at the edge and that screen is never painted.
 *
 * This checks only that the cookie is PRESENT. It cannot check that it is valid: the
 * cookie is signed with SESSION_SECRET, which lives in the API and deliberately does
 * not exist in the web process. So this is a routing hint, not an authorisation check —
 * every endpoint still verifies the session server-side, and a stale cookie still ends
 * in a 401 that the client turns into a redirect. Treating this as the security
 * boundary would be the mistake; the boundary is the API.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    // Where they were headed, so signing in returns them there instead of dumping
    // everyone on the pipeline.
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/leads';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets and the proxied API routes. /api must be
  // excluded or the 401 the client relies on would become a 307 to /login, and every
  // fetch would silently receive an HTML login page instead of the JSON envelope.
  matcher: ['/((?!api|webhooks|_next/static|_next/image|favicon.ico).*)'],
};
