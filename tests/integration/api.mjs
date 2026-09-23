/** Real local Supabase API verification. Refuses cloud hosts. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Integration fixtures are local-only');
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(anon && service, 'Supply local SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');
const users = [];
const suffix = randomUUID().slice(0, 8);
const uploadedPaths = [];
let passed = 0;
async function request(path, {token = anon, method = 'GET', body, headers = {}} = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {apikey: token === service ? service : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...headers},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = raw; }
  return {status: response.status, ok: response.ok, data};
}
async function success(path, options) {
  const r = await request(path, options);
  assert(r.ok, `${path}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
function check(condition, message) { assert(condition, message); passed++; console.log(`PASS ${message}`); }
async function signup(role) {
  const email = `integration-${role}-${users.length}-${suffix}@example.test`;
  const data = await success('/auth/v1/signup', {method:'POST',body:{email,password:`Test-${randomUUID()}-9a!`,data:{full_name:`Test ${role}`,requested_role:role}}});
  assert(data.user?.id && data.access_token, 'Email confirmation must be disabled for pilot signup');
  users.push(data.user.id);
  return {id:data.user.id,token:data.access_token};
}
try {
  const teacher = await signup('teacher');
  const otherTeacher = await signup('teacher');
  const student = await signup('student');
  const student2 = await signup('student');
  const spoof = await signup('admin');
  const spoofProfile = await success(`/rest/v1/profiles?id=eq.${spoof.id}`, {token:spoof.token});
  check(spoofProfile[0]?.role !== 'admin', 'signup metadata cannot grant administrator');
  const escalate = await request(`/rest/v1/profiles?id=eq.${student.id}`, {token:student.token,method:'PATCH',body:{role:'admin'}});
  const afterEscalate = await success(`/rest/v1/profiles?id=eq.${student.id}`, {token:service});
  check(!escalate.ok || afterEscalate[0].role === 'student', 'student cannot promote their profile');
  const anonProfiles = await request('/rest/v1/profiles');
  check(!anonProfiles.ok || anonProfiles.data.length === 0, 'anonymous cannot read private profiles');
  const peer = await success(`/rest/v1/profiles?id=eq.${student2.id}`, {token:student.token});
  check(peer.length === 0, 'students cannot read another private profile');
  await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}`, {token:service,method:'PATCH',body:{approved:true}});
  await success(`/rest/v1/teacher_profiles?id=eq.${otherTeacher.id}`, {token:service,method:'PATCH',body:{approved:true}});
  const offerings = await success('/rest/v1/offerings?limit=1');
  assert(offerings.length, 'Seed academic catalogue before integration');
  const groupRows = await success('/rest/v1/groups', {token:teacher.token,method:'POST',body:{teacher_id:teacher.id,offering_id:offerings[0].id,name:`Integration ${suffix}`,capacity:1,status:'published'}});
  const group = groupRows[0];
  const otherEdit = await request(`/rest/v1/groups?id=eq.${group.id}`,{token:otherTeacher.token,method:'PATCH',body:{name:'Unauthorized'}});
  const unchanged = await success(`/rest/v1/groups?id=eq.${group.id}`,{token:teacher.token});
  check(!otherEdit.ok || unchanged[0].name === group.name, 'teacher cannot edit another teacher group');
  const enroll1 = await success('/rest/v1/rpc/request_enrollment',{token:student.token,method:'POST',body:{p_group_id:group.id}});
  const enroll2 = await success('/rest/v1/rpc/request_enrollment',{token:student2.token,method:'POST',body:{p_group_id:group.id}});
  const selfAccept = await request('/rest/v1/rpc/decide_enrollment',{token:student.token,method:'POST',body:{p_enrollment_id:enroll1,p_status:'accepted'}});
  check(!selfAccept.ok, 'student cannot accept their own enrollment');
  const acceptResults = await Promise.all([enroll1,enroll2].map(id=>request('/rest/v1/rpc/decide_enrollment',{token:teacher.token,method:'POST',body:{p_enrollment_id:id,p_status:'accepted'}})));
  const accepted = await success(`/rest/v1/enrollments?group_id=eq.${group.id}&status=eq.accepted`,{token:teacher.token});
  check(accepted.length === 1 && acceptResults.filter(r=>r.ok).length === 1, 'concurrent last-seat approvals cannot overfill capacity');
  const slot = await success('/rest/v1/rpc/save_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_weekday:0,p_start_time:'18:00',p_end_time:'20:00'}});
  assert(slot);
  const overlap = await request('/rest/v1/rpc/save_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_weekday:0,p_start_time:'19:00',p_end_time:'21:00'}});
  check(!overlap.ok,'overlapping recurring teacher slot rejected');
  const lessonId = await success('/rest/v1/rpc/create_lesson',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_title:'Integration lesson',p_starts_at:'2027-01-03T16:00:00Z',p_ends_at:'2027-01-03T18:00:00Z'}});
  const member = accepted[0].student_id === student.id ? student : student2;
  const pending = member.id === student.id ? student2 : student;
  const privateLessons = await success(`/rest/v1/lessons?id=eq.${lessonId}`,{token:pending.token});
  check(privateLessons.length===0,'pending student cannot read private lessons');
  const memberLessons = await success(`/rest/v1/lessons?id=eq.${lessonId}`,{token:member.token});
  check(memberLessons.length===1,'accepted student can read their lesson');
  const objectPath = `${teacher.id}/${lessonId}/${randomUUID()}.pdf`;
  const upload = await fetch(`${origin}/storage/v1/object/lesson-materials/${objectPath}`, {method:'POST',headers:{apikey:anon,Authorization:`Bearer ${teacher.token}`,'Content-Type':'application/pdf'},body:'%PDF-1.4\n%%EOF'});
  assert(upload.ok, `Teacher upload failed: ${upload.status} ${await upload.text()}`);
  uploadedPaths.push(objectPath);
  await success('/rest/v1/lesson_materials',{token:teacher.token,method:'POST',body:{lesson_id:lessonId,kind:'file',title:'Test PDF',storage_path:objectPath,file_size:14,mime_type:'application/pdf',uploaded_by:teacher.id}});
  const signBody = {expiresIn:60};
  const memberDownload = await request(`/storage/v1/object/sign/lesson-materials/${objectPath}`,{token:member.token,method:'POST',body:signBody});
  check(memberDownload.ok,'accepted student can obtain a private download');
  const pendingDownload = await request(`/storage/v1/object/sign/lesson-materials/${objectPath}`,{token:pending.token,method:'POST',body:signBody});
  check(!pendingDownload.ok,'pending student cannot obtain a private download');
  const fakeLink = await request('/rest/v1/lesson_materials',{token:teacher.token,method:'POST',body:{lesson_id:lessonId,kind:'link',title:'Unsafe',url:'javascript:alert(1)',uploaded_by:teacher.id}});
  check(!fakeLink.ok,'database rejects unsafe material link');
  await success('/rest/v1/rpc/decide_enrollment',{token:teacher.token,method:'POST',body:{p_enrollment_id:accepted[0].id,p_status:'removed'}});
  const removedLessons = await success(`/rest/v1/lessons?id=eq.${lessonId}`,{token:member.token});
  check(removedLessons.length===0,'removed student loses lesson access');
  const removedDownload = await request(`/storage/v1/object/sign/lesson-materials/${objectPath}`,{token:member.token,method:'POST',body:signBody});
  check(!removedDownload.ok,'removed student cannot obtain a new private download');
  const firstGeneration = await success('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-02-01',p_until:'2027-02-14'}});
  const secondGeneration = await success('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-02-01',p_until:'2027-02-14'}});
  check(firstGeneration===2 && secondGeneration===0,'recurring lesson generation is idempotent');
  const forgedAdmin = await request('/rest/v1/rpc/admin_update_user',{token:student.token,method:'POST',body:{p_user_id:teacher.id,p_status:'suspended'}});
  check(!forgedAdmin.ok,'ordinary user cannot invoke admin suspension');
  await success(`/rest/v1/profiles?id=eq.${teacher.id}`,{token:service,method:'PATCH',body:{status:'suspended'}});
  const suspendedWrite = await request('/rest/v1/rpc/create_lesson',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_title:'Should fail',p_starts_at:'2027-01-04T16:00:00Z',p_ends_at:'2027-01-04T18:00:00Z'}});
  check(!suspendedWrite.ok,'suspension blocks a previously authenticated session');
  console.log(`Verified ${passed} real API assertions.`);
} finally {
  if (uploadedPaths.length) {
    const cleanup = await request('/storage/v1/object/lesson-materials',{token:service,method:'DELETE',body:{prefixes:uploadedPaths}});
    if (!cleanup.ok) console.error(`Storage fixture cleanup failed: ${cleanup.status}`);
  }
  for (const id of users.reverse()) {
    const result = await request(`/auth/v1/admin/users/${id}`,{token:service,method:'DELETE'});
    if (!result.ok) console.error(`Fixture cleanup failed for ${id}: ${result.status}`);
  }
}
