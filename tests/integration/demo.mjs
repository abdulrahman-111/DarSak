/** Smoke-test the opt-in synthetic demo against a disposable local backend. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const status = JSON.parse(
  execFileSync('supabase', ['status', '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
);
const origin = new URL(status.API_URL);
assert(
  ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname),
  'Demo smoke test is local-only',
);
assert(
  origin.protocol === 'http:' && !origin.username && !origin.password,
  'Expected a local HTTP API',
);
const key = status.ANON_KEY;
assert(key, 'Local anonymous key missing');
const groupId = 'de100000-0000-4000-8000-000000000001';
const lessonId = 'de200000-0000-4000-8000-000000000001';

async function request(path, token = key, body) {
  const response = await fetch(new URL(path, origin), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  assert(response.ok, `Demo API check failed (${response.status}) for ${path.split('?')[0]}`);
  if (response.status === 204) return null;
  return response.json();
}

for (const role of ['teacher', 'student', 'admin']) {
  const session = await request('/auth/v1/token?grant_type=password', key, {
    email: `${role}@demo.invalid`,
    password: 'DarSak-local-demo-2026!',
  });
  assert(session.access_token && session.user?.id, `Demo ${role} sign-in failed`);
  try {
    const profile = await request(
      `/rest/v1/profiles?id=eq.${session.user.id}&select=role,status`,
      session.access_token,
    );
    assert.equal(profile.length, 1);
    assert.equal(profile[0].role, role);
    assert.equal(profile[0].status, 'active');
    if (role === 'student' || role === 'teacher') {
      const groups = await request(
        `/rest/v1/groups?id=eq.${groupId}&select=id,status`,
        session.access_token,
      );
      assert.equal(groups.length, 1, `${role} can read the published demo group`);
      assert.equal(groups[0].status, 'published');
      const lessons = await request(
        `/rest/v1/lessons?id=eq.${lessonId}&select=id,starts_at,ends_at`,
        session.access_token,
      );
      assert.equal(lessons.length, 1, `${role} can read the demo lesson`);
      assert(Date.parse(lessons[0].ends_at) > Date.parse(lessons[0].starts_at));
      const materials = await request(
        `/rest/v1/lesson_materials?lesson_id=eq.${lessonId}&select=kind,url`,
        session.access_token,
      );
      assert.equal(materials.length, 1, `${role} can read the demo resource`);
      assert.equal(materials[0].kind, 'link');
      assert.equal(materials[0].url, 'https://en.wikipedia.org/wiki/Elementary_algebra');
    }
    console.log(`PASS: ${role} demo sign-in, role, and accessible data`);
  } finally {
    await request('/auth/v1/logout', session.access_token, {});
  }
}
const privateResponse = await fetch(
  new URL(`/rest/v1/lesson_materials?lesson_id=eq.${lessonId}&select=id`, origin),
  {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  },
);
if (privateResponse.ok) {
  assert.deepEqual(
    await privateResponse.json(),
    [],
    'Anonymous visitors cannot read demo lesson materials',
  );
} else {
  assert([401, 403].includes(privateResponse.status), 'Expected anonymous access to be denied');
}
console.log('PASS: anonymous visitors cannot read private demo resources');
