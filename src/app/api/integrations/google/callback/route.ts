import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleMeetConfig, GOOGLE_MEET_FLOW_COOKIE } from '@/features/meet/config';
import { completeGoogleOAuth, getVerifiedGoogleViewer } from '@/features/meet/oauth';

export const runtime = 'nodejs';

function clearFlowCookie(response: NextResponse) {
  response.cookies.set(GOOGLE_MEET_FLOW_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/integrations/google/callback',
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

export async function GET(request: NextRequest) {
  const config = getGoogleMeetConfig();
  if (!config) return clearFlowCookie(new NextResponse('Not found', { status: 404 }));

  const jar = await cookies();
  const cookieValue = jar.get(GOOGLE_MEET_FLOW_COOKIE)?.value;
  const params = request.nextUrl.searchParams;
  const state = params.get('state') ?? undefined;
  const code = params.get('code') ?? undefined;
  const error = params.get('error') ?? undefined;
  let locale: 'en' | 'ar' = 'en';
  let target = '/en/account/integrations?google_meet=invalid_flow';
  try {
    const viewer = await getVerifiedGoogleViewer();
    if (viewer) {
      target = await completeGoogleOAuth({
        db: viewer.db,
        userId: viewer.user.id,
        sessionId: viewer.sessionId,
        cookieValue,
        returnedState: state,
        code,
        error,
      });
    }
    const redirect = new URL(target, new URL(config.redirectUri).origin);
    return clearFlowCookie(NextResponse.redirect(redirect, 303));
  } catch {
    return clearFlowCookie(
      NextResponse.redirect(new URL(target, new URL(config.redirectUri).origin), 303),
    );
  }
}
