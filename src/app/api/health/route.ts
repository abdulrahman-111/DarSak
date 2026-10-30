import { isSupabaseHealthy } from '@/lib/health-check.server';

const headers = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
};

/** Public, cookie-less infrastructure check. It deliberately reports no details. */
export async function GET() {
  const healthy = await isSupabaseHealthy();
  return new Response(JSON.stringify({ status: healthy ? 'healthy' : 'unhealthy' }), {
    status: healthy ? 200 : 503,
    headers,
  });
}
