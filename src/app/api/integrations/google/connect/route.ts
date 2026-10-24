import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleMeetConfig, GOOGLE_MEET_FLOW_COOKIE } from '@/features/meet/config';
import { getVerifiedGoogleViewer, startGoogleOAuth } from '@/features/meet/oauth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const config = getGoogleMeetConfig();
  if (!config) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  if (
    request.headers.get('origin') !== new URL(config.redirectUri).origin ||
    !(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')
  ) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }
  const viewer = await getVerifiedGoogleViewer();
  if (!viewer) return NextResponse.json({ error: 'not_authorized' }, { status: 401 });
  let locale: 'en' | 'ar' = 'en';
  try {
    const body = await request.json();
    if (body?.locale === 'ar') locale = 'ar';
  } catch {
    /* Locale is an optional fixed-path hint. */
  }

  try {
    const flow = await startGoogleOAuth(viewer.db, viewer.user.id, viewer.sessionId, locale);
    const response = NextResponse.json({ authorizationUrl: flow.authorizationUrl });
    response.cookies.set(GOOGLE_MEET_FLOW_COOKIE, flow.cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/integrations/google/callback',
      maxAge: 600,
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'temporarily_unavailable' }, { status: 503 });
  }
}
