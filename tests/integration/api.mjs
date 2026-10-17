/** Real local Supabase API verification. Refuses cloud hosts. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
const origin = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Integration fixtures are local-only');
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(anon && service, 'Supply local SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');
const users = [];
const suffix = randomUUID().slice(0, 8);
const uploadedPaths = [];
const uploadedAvatarPaths = [];
const uploadedCoverPaths = [];
const signBody = {expiresIn:60};
const wait = milliseconds => new Promise(resolve=>setTimeout(resolve,milliseconds));
let passed = 0;
async function request(path, {token = anon, method = 'GET', body, headers = {}, timeoutMs = 10000} = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {apikey: token === service ? service : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...headers},
    signal: AbortSignal.timeout(timeoutMs),
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
async function uploadAvatar(path, mime, bytes, token) {
  const response = await fetch(`${origin}/storage/v1/object/teacher-avatars/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: {apikey: token === service ? service : anon, Authorization: `Bearer ${token}`, 'Content-Type': mime, 'x-upsert': 'false'},
    body: bytes,
  });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = raw; }
  return {status: response.status, ok: response.ok, data};
}
function check(condition, message) { assert(condition, message); passed++; console.log(`PASS ${message}`); }
async function signup(role) {
  const email = `integration-${role}-${users.length}-${suffix}@example.test`;
  const data = await success('/auth/v1/signup', {method:'POST',body:{email,password:`Test-${randomUUID()}-9a!`,data:{full_name:`Test ${role}`,requested_role:role}}});
  assert(data.user?.id && data.access_token, 'Email confirmation must be disabled for pilot signup');
  users.push(data.user.id);
  return {id:data.user.id,token:data.access_token};
}
// These API fixtures exercise the pre-application teacher review and access
// paths. Mark only the four named test accounts as grandfathered; application
// submission and new-teacher approval guards are covered by separate tests.
function localDockerSQL(sql) {
  execFileSync('docker',['exec','supabase_db_private-teachers','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',sql],{stdio:'ignore'});
}
function seedLegacyTeacherApplications(fixtures) {
  const exactFixtures = fixtures.map(({id, status}) => {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Legacy fixture UUID must be exact');
    assert(['draft', 'approved'].includes(status), 'Legacy fixture status must be explicit');
    return `('${id}'::uuid,'${status}'::text)`;
  }).join(',');
  const sql = `do $$ declare v_count integer; begin with fixture(teacher_id,application_status) as (values ${exactFixtures}) update public.teacher_applications a set legacy_approved=true,status=fixture.application_status from fixture where a.teacher_id=fixture.teacher_id; get diagnostics v_count=row_count; if v_count<>${fixtures.length} then raise exception 'legacy application fixture count mismatch'; end if; end $$;`;
  localDockerSQL(sql);
}
try {
  const teacher = await signup('teacher');
  const otherTeacher = await signup('teacher');
  const pendingTeacher = await signup('teacher');
  const reviewTeacher = await signup('teacher');
  const legacyReviewTeacher = await signup('teacher');
  const student = await signup('student');
  const student2 = await signup('student');
  const spoof = await signup('admin');
  seedLegacyTeacherApplications([
    {id:teacher.id,status:'approved'},
    {id:otherTeacher.id,status:'approved'},
    {id:reviewTeacher.id,status:'draft'},
    {id:legacyReviewTeacher.id,status:'draft'},
  ]);
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
  await success(`/rest/v1/profiles?id=eq.${spoof.id}`, {token:service,method:'PATCH',body:{role:'admin'}});
  const reviewState = await success('/rest/v1/rpc/teacher_review_status',{token:reviewTeacher.token,method:'POST',body:{}});
  check(reviewState.status==='pending' && reviewState.request_id && reviewState.events.some(event=>event.kind==='requested'),'new Auth teacher starts pending with one request event');
  const rawReviewWrite = await request(`/rest/v1/teacher_review_state?teacher_id=eq.${reviewTeacher.id}`,{token:reviewTeacher.token,method:'PATCH',body:{status:'approved'}});
  const reviewAfterRawWrite = await success('/rest/v1/rpc/teacher_review_status',{token:reviewTeacher.token,method:'POST',body:{}});
  check(!rawReviewWrite.ok && reviewAfterRawWrite.status==='pending','teacher cannot change review state through raw Data API writes');
  const firstDecision = await success('/rest/v1/rpc/admin_decide_teacher_review',{token:spoof.token,method:'POST',body:{p_teacher_id:reviewTeacher.id,p_expected_request_id:reviewState.request_id,p_decision:'declined',p_reason:'Add a teaching experience example.'}});
  const staleDecision = await request('/rest/v1/rpc/admin_decide_teacher_review',{token:spoof.token,method:'POST',body:{p_teacher_id:reviewTeacher.id,p_expected_request_id:reviewState.request_id,p_decision:'approved',p_reason:null}});
  const declinedReview = await success('/rest/v1/rpc/teacher_review_status',{token:reviewTeacher.token,method:'POST',body:{}});
  check(firstDecision && !staleDecision.ok && declinedReview.status==='declined' && declinedReview.decline_reason==='Add a teaching experience example.','decline saves its reason and rejects a repeated stale decision');
  const newRequestId = await success('/rest/v1/rpc/request_teacher_review',{token:reviewTeacher.token,method:'POST',body:{}});
  const pendingAgain = await success('/rest/v1/rpc/teacher_review_status',{token:reviewTeacher.token,method:'POST',body:{}});
  const duplicateRequestId = await success('/rest/v1/rpc/request_teacher_review',{token:reviewTeacher.token,method:'POST',body:{}});
  check(newRequestId!==reviewState.request_id && duplicateRequestId===newRequestId && pendingAgain.status==='pending' && pendingAgain.decline_reason===null,'explicit resubmission creates one new pending token and pending clicks reuse it');
  const competingDecisions = await Promise.all([
    request('/rest/v1/rpc/admin_decide_teacher_review',{token:spoof.token,method:'POST',body:{p_teacher_id:reviewTeacher.id,p_expected_request_id:newRequestId,p_decision:'approved',p_reason:null}}),
    request('/rest/v1/rpc/admin_decide_teacher_review',{token:spoof.token,method:'POST',body:{p_teacher_id:reviewTeacher.id,p_expected_request_id:newRequestId,p_decision:'declined',p_reason:'Concurrent decline'}}),
  ]);
  const reviewEvents = await success(`/rest/v1/teacher_review_events?teacher_id=eq.${reviewTeacher.id}&kind=in.(approved,declined)`,{token:spoof.token});
  check(competingDecisions.filter(result=>result.ok).length===1 && competingDecisions.filter(result=>!result.ok).length===1 && reviewEvents.length===2,'concurrent decisions produce one winner per pending request');
  const selfAdminTarget = await request('/rest/v1/rpc/admin_update_user',{token:spoof.token,method:'POST',body:{p_user_id:spoof.id,p_status:'suspended',p_approved:null}});
  const adminTargetReview = await request('/rest/v1/rpc/admin_decide_teacher_review',{token:spoof.token,method:'POST',body:{p_teacher_id:spoof.id,p_expected_request_id:null,p_decision:'approved',p_reason:null}});
  check(!selfAdminTarget.ok && !adminTargetReview.ok,'database guards reject self-target and administrative-target review changes');
  await success('/rest/v1/rpc/admin_update_user',{token:spoof.token,method:'POST',body:{p_user_id:legacyReviewTeacher.id,p_status:'active',p_approved:true}});
  const legacyApproved = await success('/rest/v1/rpc/teacher_review_status',{token:legacyReviewTeacher.token,method:'POST',body:{}});
  const contradictoryLegacy = await request('/rest/v1/rpc/admin_update_user',{token:spoof.token,method:'POST',body:{p_user_id:legacyReviewTeacher.id,p_status:'suspended',p_approved:false}});
  const legacyProfile = await success(`/rest/v1/profiles?id=eq.${legacyReviewTeacher.id}&select=status`,{token:service});
  check(legacyApproved.status==='approved' && !contradictoryLegacy.ok && legacyProfile[0].status==='active','legacy approval synchronizes review status and rejects contradictory completed decisions before suspension');
  const adminSubject = (await success('/rest/v1/subjects', {token:spoof.token,method:'POST',body:{name_ar:'اختبار تكامل',name_en:'Integration subject',slug:`integration-${suffix}`}}))[0];
  check(Boolean(adminSubject?.id), 'active admin can create catalogue records');
  const ordinaryCatalogueWrite = await request('/rest/v1/subjects', {token:student.token,method:'POST',body:{name_ar:'مرفوض',name_en:'Denied',slug:`denied-${suffix}`}});
  check(!ordinaryCatalogueWrite.ok, 'ordinary user cannot mutate the catalogue');
  await success('/rest/v1/platform_settings?on_conflict=key', {token:spoof.token,method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:{key:`integration_${suffix}`,value:{enabled:true}}});
  const adminSetting = await success(`/rest/v1/platform_settings?key=eq.integration_${suffix}`, {token:spoof.token});
  check(adminSetting.length===1, 'active admin can manage platform settings');
  await success(`/rest/v1/platform_settings?key=eq.integration_${suffix}`, {token:spoof.token,method:'DELETE'});
  await success(`/rest/v1/subjects?id=eq.${adminSubject.id}`, {token:spoof.token,method:'DELETE'});
  const offerings = await success('/rest/v1/offerings?limit=1');
  assert(offerings.length, 'Seed academic catalogue before integration');
  const groupRows = await success('/rest/v1/groups', {token:teacher.token,method:'POST',body:{teacher_id:teacher.id,offering_id:offerings[0].id,name:`Integration ${suffix}`,capacity:1,status:'draft'}});
  const group = groupRows[0];
  const otherGroup = (await success('/rest/v1/groups', {token:otherTeacher.token,method:'POST',body:{teacher_id:otherTeacher.id,offering_id:offerings[0].id,name:`Other ${suffix}`,capacity:4,status:'draft'}}))[0];
  const slot = await success('/rest/v1/rpc/save_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_weekday:0,p_start_time:'18:00',p_end_time:'20:00'}});
  const otherSlot = await success('/rest/v1/rpc/save_schedule_slot',{token:otherTeacher.token,method:'POST',body:{p_group_id:otherGroup.id,p_weekday:1,p_start_time:'12:00',p_end_time:'13:00'}});
  const directPublish = await request(`/rest/v1/groups?id=eq.${group.id}`,{token:teacher.token,method:'PATCH',body:{status:'published'}});
  const remainsDraft = await success(`/rest/v1/groups?id=eq.${group.id}`,{token:teacher.token});
  check(!directPublish.ok && remainsDraft[0].status==='draft','direct Data API publication is rejected');
  const publishedCount = await success('/rest/v1/rpc/publish_group',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:null,p_until:null}});
  const otherPublishedCount = await success('/rest/v1/rpc/publish_group',{token:otherTeacher.token,method:'POST',body:{p_group_id:otherGroup.id,p_from:null,p_until:null}});
  check(publishedCount===0 && otherPublishedCount===0,'owner publishes scheduled groups atomically without generation');
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
  const acceptedPage = await success('/rest/v1/rpc/teacher_enrollment_page',{token:teacher.token,method:'POST',body:{p_status:'accepted',p_offset:0,p_limit:20}});
  const foreignEnrollmentPage = await success('/rest/v1/rpc/teacher_enrollment_page',{token:otherTeacher.token,method:'POST',body:{p_status:'accepted',p_offset:0,p_limit:20}});
  const studentEnrollmentPage = await request('/rest/v1/rpc/teacher_enrollment_page',{token:student.token,method:'POST',body:{p_status:'accepted',p_offset:0,p_limit:20}});
  const anonymousEnrollmentPage = await request('/rest/v1/rpc/teacher_enrollment_page',{method:'POST',body:{p_status:'accepted',p_offset:0,p_limit:20}});
  const serviceEnrollmentPage = await request('/rest/v1/rpc/teacher_enrollment_page',{token:service,method:'POST',body:{p_status:'accepted',p_offset:0,p_limit:20}});
  check(acceptedPage.total===1 && acceptedPage.rows[0]?.enrollment_id===accepted[0].id && acceptedPage.rows[0]?.full_name
    && foreignEnrollmentPage.total===0 && foreignEnrollmentPage.rows.length===0
    && !studentEnrollmentPage.ok && !anonymousEnrollmentPage.ok && !serviceEnrollmentPage.ok,
    'teacher enrollment projection is paged, tenant-scoped, and denies student, anonymous, and service callers');
  await success('/rest/v1/rpc/admin_update_user',{token:spoof.token,method:'POST',body:{p_user_id:pendingTeacher.id,p_status:'suspended',p_approved:null}});
  const suspendedEnrollmentPage = await request('/rest/v1/rpc/teacher_enrollment_page',{token:pendingTeacher.token,method:'POST',body:{p_status:'pending',p_offset:0,p_limit:20}});
  await success('/rest/v1/rpc/admin_update_user',{token:spoof.token,method:'POST',body:{p_user_id:pendingTeacher.id,p_status:'active',p_approved:null}});
  check(!suspendedEnrollmentPage.ok,'suspended teacher cannot call teacher enrollment projection');
  const publicGroup = await success(`/rest/v1/rpc/public_groups?id=eq.${group.id}`);
  check(publicGroup.length===1 && publicGroup[0].accepted_count===1 && publicGroup[0].available_seats===0 && publicGroup[0].teacher_name, 'anonymous discovery exposes safe capacity and teacher projection');
  const discovery = await success('/rest/v1/rpc/discover_groups',{method:'POST',body:{p_teacher_id:teacher.id,p_weekday:0,p_query:`Integration ${suffix}`,p_offset:0,p_limit:12}});
  const discoveryRow = discovery.find(row=>row.id===group.id);
  check(discoveryRow?.weekdays?.includes(0) && discoveryRow.accepted_count===1 && discoveryRow.available_seats===0 && Object.keys(discoveryRow).length===18 && !('lesson_title' in discoveryRow) && !('roster' in discoveryRow),'anonymous discovery filters safely and returns its exact 18-field schedule projection');
  const publicDetail = await success('/rest/v1/rpc/public_group_detail',{method:'POST',body:{p_group_id:group.id}});
  const hiddenDetail = await success('/rest/v1/rpc/public_group_detail',{method:'POST',body:{p_group_id:'ffffffff-ffff-4fff-8fff-ffffffffffff'}});
  check(publicDetail.length===1 && publicDetail[0].id===group.id && publicDetail[0].weekdays?.includes(0) && hiddenDetail.length===0,'anonymous group detail ignores list pagination and hides nonexistent groups');
  const longDiscoveryQuery = await request('/rest/v1/rpc/discover_groups',{method:'POST',body:{p_query:'x'.repeat(121)}});
  check(!longDiscoveryQuery.ok,'discovery rejects overlong search strings through the Data API');
  const duplicateGroupId = await success('/rest/v1/rpc/duplicate_group',{token:teacher.token,method:'POST',body:{p_group_id:group.id}});
  const copiedGroup = (await success(`/rest/v1/groups?id=eq.${duplicateGroupId}`,{token:teacher.token}))[0];
  const copiedSlots = await success(`/rest/v1/group_schedule_slots?group_id=eq.${duplicateGroupId}`,{token:teacher.token});
  const copiedEnrollments = await success(`/rest/v1/enrollments?group_id=eq.${duplicateGroupId}`,{token:teacher.token});
  const sourceEnrollments = await success(`/rest/v1/enrollments?group_id=eq.${group.id}`,{token:teacher.token});
  check(copiedGroup?.teacher_id===teacher.id && copiedGroup.offering_id===group.offering_id && copiedGroup.description===group.description && copiedGroup.capacity===group.capacity && copiedGroup.location===group.location && copiedGroup.status==='draft' && copiedGroup.name.endsWith(' (copy)') && copiedGroup.name.length<=120 && copiedSlots.length===0 && copiedEnrollments.length===0 && sourceEnrollments.length===2,'duplicate group copies bounded details into an unattached owned draft and leaves memberships with the source');
  const foreignDuplicate = await request('/rest/v1/rpc/duplicate_group',{token:otherTeacher.token,method:'POST',body:{p_group_id:group.id}});
  const studentDuplicate = await request('/rest/v1/rpc/duplicate_group',{token:student.token,method:'POST',body:{p_group_id:group.id}});
  const serviceDuplicate = await request('/rest/v1/rpc/duplicate_group',{token:service,method:'POST',body:{p_group_id:group.id}});
  check(!foreignDuplicate.ok && !studentDuplicate.ok && !serviceDuplicate.ok,'foreign teachers, students, and service-role requests cannot duplicate a group');
  const adminDuplicateId = await success('/rest/v1/rpc/duplicate_group',{token:spoof.token,method:'POST',body:{p_group_id:otherGroup.id}});
  const adminDuplicate = (await success(`/rest/v1/groups?id=eq.${adminDuplicateId}`,{token:spoof.token}))[0];
  check(adminDuplicate?.teacher_id===otherTeacher.id && adminDuplicate.status==='draft','admin duplicate stays owned by the original active teacher as a draft');
  assert(slot);
  const ownerSlots = await success(`/rest/v1/group_schedule_slots?group_id=eq.${group.id}`,{token:teacher.token});
  check(ownerSlots.some(row=>row.id===slot),'authenticated group owner can read their schedule slot');
  const publicSlots = await success(`/rest/v1/group_schedule_slots?group_id=eq.${group.id}`);
  check(publicSlots.some(row=>row.id===slot),'anonymous can read schedule slots for an active approved published group');
  const draftGroup = (await success('/rest/v1/groups',{token:service,method:'POST',body:{teacher_id:teacher.id,offering_id:offerings[0].id,name:`Draft ${suffix}`,capacity:4,status:'draft'}}))[0];
  await success('/rest/v1/group_schedule_slots',{token:service,method:'POST',body:{group_id:draftGroup.id,weekday:2,start_time:'12:00',end_time:'13:00'}});
  const draftPublicSlots = await success(`/rest/v1/group_schedule_slots?group_id=eq.${draftGroup.id}`);
  check(draftPublicSlots.length===0,'anonymous cannot read schedule slots for a draft group');
  const draftSlots = await success(`/rest/v1/group_schedule_slots?group_id=eq.${draftGroup.id}`,{token:teacher.token});
  const anonDraftDelete = await request('/rest/v1/rpc/delete_schedule_slot',{method:'POST',body:{p_group_id:draftGroup.id,p_slot_id:draftSlots[0].id}});
  check(!anonDraftDelete.ok,'anonymous cannot execute schedule slot deletion');
  const foreignDraftDelete = await request('/rest/v1/rpc/delete_schedule_slot',{token:otherTeacher.token,method:'POST',body:{p_group_id:draftGroup.id,p_slot_id:draftSlots[0].id}});
  check(!foreignDraftDelete.ok,'foreign teacher cannot delete a draft schedule slot');
  await success('/rest/v1/rpc/delete_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:draftGroup.id,p_slot_id:draftSlots[0].id}});
  const afterDraftDelete = await success(`/rest/v1/group_schedule_slots?group_id=eq.${draftGroup.id}`,{token:teacher.token});
  check(afterDraftDelete.length===0,'owner can delete the last schedule slot from a draft group');
  const otherExtraSlot = await success('/rest/v1/rpc/save_schedule_slot',{token:otherTeacher.token,method:'POST',body:{p_group_id:otherGroup.id,p_weekday:3,p_start_time:'12:00',p_end_time:'13:00'}});
  const deleteOtherExtra = await request('/rest/v1/rpc/delete_schedule_slot',{token:otherTeacher.token,method:'POST',body:{p_group_id:otherGroup.id,p_slot_id:otherExtraSlot}});
  const denyDeletePublishedLast = await request('/rest/v1/rpc/delete_schedule_slot',{token:otherTeacher.token,method:'POST',body:{p_group_id:otherGroup.id,p_slot_id:otherSlot}});
  const publishedRemainingSlots = await success(`/rest/v1/group_schedule_slots?group_id=eq.${otherGroup.id}`,{token:otherTeacher.token});
  check(deleteOtherExtra.ok && !denyDeletePublishedLast.ok && publishedRemainingSlots.some(row=>row.id===otherSlot),'published owner can remove a non-last slot but not the last slot');
  await success(`/rest/v1/teacher_profiles?id=eq.${otherTeacher.id}`,{token:service,method:'PATCH',body:{approved:false}});
  const unapprovedPublicSlots = await success(`/rest/v1/group_schedule_slots?group_id=eq.${otherGroup.id}`);
  check(unapprovedPublicSlots.length===0,'anonymous cannot read schedule slots for an unapproved teacher');
  await success(`/rest/v1/teacher_profiles?id=eq.${otherTeacher.id}`,{token:service,method:'PATCH',body:{approved:true}});
  const stealSlot = await request('/rest/v1/rpc/save_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_weekday:2,p_start_time:'12:00',p_end_time:'13:00',p_slot_id:otherSlot}});
  check(!stealSlot.ok, 'teacher cannot move another teacher slot into their group');
  const foreignDeleteSlot = await request('/rest/v1/rpc/delete_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_slot_id:otherSlot}});
  check(!foreignDeleteSlot.ok,'teacher cannot delete a slot from another group');
  const directSlot = await request('/rest/v1/group_schedule_slots',{token:teacher.token,method:'POST',body:{group_id:group.id,weekday:3,start_time:'12:00',end_time:'13:00'}});
  check(!directSlot.ok, 'direct slot writes cannot bypass conflict RPC');
  const overlap = await request('/rest/v1/rpc/save_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_weekday:0,p_start_time:'19:00',p_end_time:'21:00'}});
  check(!overlap.ok,'overlapping recurring teacher slot rejected');
  const lessonId = await success('/rest/v1/rpc/create_lesson',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_title:'Integration lesson',p_starts_at:'2027-01-03T16:00:00Z',p_ends_at:'2027-01-03T18:00:00Z'}});
  const otherLesson = await success('/rest/v1/rpc/create_lesson',{token:otherTeacher.token,method:'POST',body:{p_group_id:otherGroup.id,p_title:'Other lesson',p_starts_at:'2027-01-05T10:00:00Z',p_ends_at:'2027-01-05T11:00:00Z'}});
  const stealLesson = await request('/rest/v1/rpc/create_lesson',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_lesson_id:otherLesson,p_title:'Taken over',p_starts_at:'2027-01-06T10:00:00Z',p_ends_at:'2027-01-06T11:00:00Z'}});
  check(!stealLesson.ok, 'teacher cannot move another teacher lesson into their group');
  const mismatchedSlot = await request('/rest/v1/lessons',{token:service,method:'POST',body:{group_id:group.id,slot_id:otherSlot,local_date:'2027-01-04',title:'Mismatched slot',starts_at:'2027-01-04T10:00:00Z',ends_at:'2027-01-04T11:00:00Z'}});
  check(!mismatchedSlot.ok, 'lesson slot must belong to the same group');
  await success('/rest/v1/rpc/set_lesson_status',{token:teacher.token,method:'POST',body:{p_lesson_id:lessonId,p_status:'completed'}});
  const completedLesson = await success(`/rest/v1/lessons?id=eq.${lessonId}`,{token:teacher.token});
  check(completedLesson[0]?.status==='completed', 'group owner can complete a lesson through the status RPC');
  const studentStatusWrite = await request('/rest/v1/rpc/set_lesson_status',{token:student.token,method:'POST',body:{p_lesson_id:lessonId,p_status:'cancelled'}});
  check(!studentStatusWrite.ok, 'student cannot change lesson status');
  await success('/rest/v1/rpc/set_lesson_status',{token:teacher.token,method:'POST',body:{p_lesson_id:lessonId,p_status:'scheduled'}});
  const member = accepted[0].student_id === student.id ? student : student2;
  const pending = member.id === student.id ? student2 : student;
  const contactArgs = {
    p_full_name:'Teacher Contact Name',
    p_headline:'Algebra teacher',
    p_bio:'Contact privacy integration profile.',
    p_offering_ids:[offerings[0].id],
    p_phone_number:'+201234567890',
    p_whatsapp_number:'   ',
    p_contact_email:'contact@example.test',
    p_visibility:'enrolled',
  };
  const savedProfile = await request('/rest/v1/rpc/save_teacher_profile',{token:teacher.token,method:'POST',body:contactArgs});
  check(savedProfile.ok,'active teacher can atomically save their own profile and enrolled contacts');
  const ownerContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:teacher.token});
  check(ownerContact.length===1 && ownerContact[0].whatsapp_number===null && ownerContact[0].visibility==='enrolled','contact blanks normalize to NULL and visibility defaults to enrolled');
  const savedTeacherProfile = await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=headline,bio`,{token:teacher.token});
  const savedSpecializations = await success(`/rest/v1/teacher_specializations?teacher_id=eq.${teacher.id}&select=offering_id`,{token:teacher.token});
  check(savedTeacherProfile[0]?.headline==='Algebra teacher' && savedTeacherProfile[0]?.bio==='Contact privacy integration profile.' && savedSpecializations.length===1 && savedSpecializations[0].offering_id===offerings[0].id,'profile save persists headline, bio, and specialization selection');
  const privateDetailsBefore = (await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${teacher.id}&select=details,version`,{token:teacher.token}))[0];
  check(privateDetailsBefore?.details?.about?.ar==='Contact privacy integration profile.','legacy biography is synchronized into the preferred-language About field');
  const richDetails = {
    about:{ar:'نبذة مخفية',en:'Hidden canonical biography'},approach:{ar:'',en:''},goals:{ar:'',en:''},
    qualifications:[],experience:[],languages:[],city:{ar:'',en:''},teaching_mode:null,
    layout:'classic',palette:'teal',section_order:['about','qualifications','experience','approach','goals'],hidden_sections:['about'],
  };
  const hiddenSave = await request('/rest/v1/rpc/save_teacher_profile_details',{token:teacher.token,method:'POST',body:{p_details:richDetails,p_expected_version:privateDetailsBefore.version}});
  check(hiddenSave.ok,'teacher can save canonical profile details with optimistic version');
  const detailsAfterHiddenSave = (await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${teacher.id}&select=details,version`,{token:teacher.token}))[0];
  const hiddenBioRaw = await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=bio`,{token:service});
  const hiddenBioPublicTeachers = await success('/rest/v1/rpc/public_teachers');
  const visibleProjection = await success('/rest/v1/rpc/public_teacher_profile_details',{method:'POST',body:{p_teacher_id:teacher.id}});
  check(detailsAfterHiddenSave.version===privateDetailsBefore.version+1 && !hiddenBioRaw[0].bio.includes('Hidden canonical biography') && !JSON.stringify(hiddenBioPublicTeachers).includes('Hidden canonical biography') && !JSON.stringify(visibleProjection).includes('Hidden canonical biography') && !JSON.stringify(visibleProjection).includes('hidden_sections'),'hidden About is absent from raw REST bio and both public teacher projections');
  const staleSave = await request('/rest/v1/rpc/save_teacher_profile_details',{token:teacher.token,method:'POST',body:{p_details:richDetails,p_expected_version:privateDetailsBefore.version}});
  const afterStaleSave = (await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${teacher.id}&select=details,version`,{token:teacher.token}))[0];
  check(!staleSave.ok && afterStaleSave.version===detailsAfterHiddenSave.version && afterStaleSave.details.about.en==='Hidden canonical biography','stale profile save cannot overwrite a newer version');
  const concurrentCandidates = [
    {...richDetails,approach:{ar:'Concurrent A',en:''}},
    {...richDetails,approach:{ar:'Concurrent B',en:''}},
  ];
  const concurrentSaves = await Promise.all(concurrentCandidates.map(p_details=>request('/rest/v1/rpc/save_teacher_profile_details',{token:teacher.token,method:'POST',body:{p_details,p_expected_version:detailsAfterHiddenSave.version}})));
  const afterConcurrentSaves = (await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${teacher.id}&select=details,version`,{token:teacher.token}))[0];
  check(concurrentSaves.filter(result=>result.ok).length===1 && concurrentSaves.filter(result=>!result.ok).length===1 && afterConcurrentSaves.version===detailsAfterHiddenSave.version+1 && ['Concurrent A','Concurrent B'].includes(afterConcurrentSaves.details.approach.ar),'concurrent same-version saves serialize and only one can advance the profile');
  const overlongLanguage = await request('/rest/v1/rpc/save_teacher_profile_details',{token:teacher.token,method:'POST',body:{p_details:{...richDetails,languages:[' '.repeat(1000)+'x'+' '.repeat(1000)]},p_expected_version:afterConcurrentSaves.version}});
  const afterOverlongLanguage = (await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${teacher.id}&select=details,version`,{token:teacher.token}))[0];
  check(!overlongLanguage.ok && afterOverlongLanguage.version===afterConcurrentSaves.version && JSON.stringify(afterOverlongLanguage.details.languages)===JSON.stringify(afterConcurrentSaves.details.languages),'raw profile save rejects a teaching-language label over 60 stored characters without persisting it');
  const invalidDetails = await request('/rest/v1/rpc/save_teacher_profile_details',{token:teacher.token,method:'POST',body:{p_details:{...richDetails,unexpected:true},p_expected_version:detailsAfterHiddenSave.version}});
  const foreignDetails = await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${teacher.id}&select=teacher_id`,{token:otherTeacher.token});
  const studentDetailsSave = await request('/rest/v1/rpc/save_teacher_profile_details',{token:student.token,method:'POST',body:{p_details:richDetails,p_expected_version:0}});
  check(!invalidDetails.ok && foreignDetails.length===0 && !studentDetailsSave.ok,'raw JSON with unknown fields, foreign details reads, and non-teacher saves are rejected');
  const directHiddenBioWrite = await request(`/rest/v1/teacher_profiles?id=eq.${teacher.id}`,{token:teacher.token,method:'PATCH',body:{bio:'Hidden canonical biography'}});
  const bioAfterDirectWrite = await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=bio`,{token:service});
  check(!directHiddenBioWrite.ok || bioAfterDirectWrite[0].bio!=='Hidden canonical biography','raw teacher_profiles writes cannot expose hidden canonical About');
  const legacySave = await request('/rest/v1/rpc/save_teacher_profile',{token:teacher.token,method:'POST',body:{...contactArgs,p_bio:''}});
  const detailsAfterLegacySave = (await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${teacher.id}&select=details,version`,{token:teacher.token}))[0];
  check(legacySave.ok && detailsAfterLegacySave.details.about.ar==='' && detailsAfterLegacySave.details.about.en==='Hidden canonical biography' && detailsAfterLegacySave.details.hidden_sections.includes('about'),'legacy save_teacher_profile clears hidden About and preserves other rich fields');
  const accountSave = await request('/rest/v1/rpc/save_teacher_profile_account',{token:teacher.token,method:'POST',body:{p_full_name:'Teacher Contact Name',p_headline:'Algebra teacher',p_offering_ids:[offerings[0].id],p_phone_number:'+201234567890',p_whatsapp_number:'',p_contact_email:'contact@example.test',p_visibility:'enrolled'}});
  const detailsAfterAccountSave = (await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${teacher.id}&select=details,version`,{token:teacher.token}))[0];
  check(accountSave.ok && detailsAfterAccountSave.version===detailsAfterLegacySave.version && detailsAfterAccountSave.details.about.ar==='' && detailsAfterAccountSave.details.about.en==='Hidden canonical biography','contact/account save does not replay stale About or change descriptive version');
  const newTeacherDetails = await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${pendingTeacher.id}&select=details,version`,{token:pendingTeacher.token});
  check(newTeacherDetails.length===1 && newTeacherDetails[0].version===0 && newTeacherDetails[0].details.about.ar==='' && newTeacherDetails[0].details.about.en==='','new pending teacher starts with empty owner-editable details');
  const anonPrivateContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`);
  const unrelatedPrivateContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:otherTeacher.token});
  const pendingPrivateContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:pending.token});
  check(anonPrivateContact.length===0 && unrelatedPrivateContact.length===0 && pendingPrivateContact.length===0,'anonymous, unrelated, and pending viewers cannot read enrolled-only contacts');
  const acceptedContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:member.token});
  check(acceptedContact.length===1 && acceptedContact[0].contact_email==='contact@example.test','accepted active student can read enrolled-only contact details');
  const foreignContactWrite = await request('/rest/v1/teacher_contacts',{token:teacher.token,method:'POST',body:{teacher_id:otherTeacher.id,phone_number:'+201234567890',visibility:'public'}});
  check(!foreignContactWrite.ok,'teacher cannot write a contact row for another teacher');
  const foreignProfileWrite = await request(`/rest/v1/profiles?id=eq.${otherTeacher.id}`,{token:teacher.token,method:'PATCH',body:{full_name:'Spoofed target'}});
  const foreignOwnerUnchanged = await success(`/rest/v1/profiles?id=eq.${otherTeacher.id}`,{token:service});
  check((!foreignProfileWrite.ok || foreignProfileWrite.data.length===0) && foreignOwnerUnchanged[0].full_name!=='Spoofed target','teacher cannot spoof another teacher ID in a direct profile write');
  const savedAdminProfile = await request('/rest/v1/teacher_contacts',{token:spoof.token,method:'POST',body:{teacher_id:otherTeacher.id,phone_number:'+201234567890',visibility:'enrolled'}});
  check(savedAdminProfile.ok,'active administrator can manage another teacher contact');
  const foreignContactUpdate = await request(`/rest/v1/teacher_contacts?teacher_id=eq.${otherTeacher.id}`,{token:teacher.token,method:'PATCH',body:{phone_number:'+447911123456'}});
  const adminContactCheck = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${otherTeacher.id}`,{token:spoof.token});
  check((!foreignContactUpdate.ok || foreignContactUpdate.data.length===0) && adminContactCheck[0]?.phone_number==='+201234567890','teacher cannot update another teacher contact row');
  await success(`/rest/v1/teacher_contacts?teacher_id=eq.${otherTeacher.id}`,{token:spoof.token,method:'DELETE'});
  await success(`/rest/v1/enrollments?id=eq.${accepted[0].id}`,{token:service,method:'PATCH',body:{status:'rejected'}});
  const rejectedContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:member.token});
  check(rejectedContact.length===0,'rejected student membership loses enrolled-only contact access');
  await success(`/rest/v1/enrollments?id=eq.${accepted[0].id}`,{token:service,method:'PATCH',body:{status:'cancelled'}});
  const cancelledContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:member.token});
  check(cancelledContact.length===0,'cancelled student membership cannot read enrolled-only contacts');
  await success(`/rest/v1/enrollments?id=eq.${accepted[0].id}`,{token:service,method:'PATCH',body:{status:'removed'}});
  const removedContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:member.token});
  check(removedContact.length===0,'removed student membership cannot read enrolled-only contacts');
  await success(`/rest/v1/enrollments?id=eq.${accepted[0].id}`,{token:service,method:'PATCH',body:{status:'accepted'}});
  const acceptedAgainContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:member.token});
  check(acceptedAgainContact.length===1,'current accepted membership restores enrolled-only contact access');
  const badProfile = await request('/rest/v1/rpc/save_teacher_profile',{token:teacher.token,method:'POST',body:{...contactArgs,p_full_name:'Attempted changed name',p_offering_ids:['00000000-0000-0000-0000-000000000000']}});
  const preservedProfile = await success(`/rest/v1/profiles?id=eq.${teacher.id}`,{token:teacher.token});
  const preservedTeacherProfile = await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=headline,bio`,{token:teacher.token});
  const preservedSpecializations = await success(`/rest/v1/teacher_specializations?teacher_id=eq.${teacher.id}&select=offering_id`,{token:teacher.token});
  const preservedContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}`,{token:teacher.token});
  check(!badProfile.ok && preservedProfile[0].full_name==='Teacher Contact Name' && preservedTeacherProfile[0].headline==='Algebra teacher' && preservedSpecializations.length===1 && preservedSpecializations[0].offering_id===offerings[0].id && preservedContact[0].contact_email==='contact@example.test','rejected save preserves existing profile, specialization, and contact data');
  await success('/rest/v1/rpc/save_teacher_profile',{token:teacher.token,method:'POST',body:{...contactArgs,p_phone_number:'',p_whatsapp_number:'+447911123456',p_visibility:'public'}});
  const publicContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`);
  const publicContactAsTeacher = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:teacher.token});
  check(publicContact.length===0 && publicContactAsTeacher[0]?.visibility==='enrolled' && publicContactAsTeacher[0]?.phone_number===null && publicContactAsTeacher[0]?.whatsapp_number==='+447911123456','legacy public opt-in is normalized to enrolled-only and remains hidden from visitors');
  await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}`,{token:service,method:'PATCH',body:{approved:false}});
  const unapprovedContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`);
  check(unapprovedContact.length===0,'unapproved teacher contact remains hidden from visitors');
  await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}`,{token:service,method:'PATCH',body:{approved:true}});
  await success(`/rest/v1/profiles?id=eq.${teacher.id}`,{token:service,method:'PATCH',body:{status:'suspended'}});
  const suspendedOwnerContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:teacher.token});
  const suspendedPublicContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`);
  check(suspendedOwnerContact.length===0 && suspendedPublicContact.length===0,'suspended teacher contacts are hidden from owner and public viewers');
  await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}`,{token:service,method:'PATCH',body:{visibility:'enrolled'}});
  const suspendedEnrolledContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:member.token});
  check(suspendedEnrolledContact.length===0,'suspended teacher contacts are hidden from accepted students too');
  await success(`/rest/v1/profiles?id=eq.${teacher.id}`,{token:service,method:'PATCH',body:{status:'active'}});
  const restoredEnrolledContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:member.token});
  check(restoredEnrolledContact.length===1,'approved active teacher contact is available to an accepted active student');
  const protectedFields = await success(`/rest/v1/profiles?id=eq.${teacher.id}&select=role,status`,{token:teacher.token});
  const protectedApproval = await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=approved`,{token:teacher.token});
  const loginUser = await success(`/auth/v1/admin/users/${teacher.id}`,{token:service});
  check(protectedFields[0].role==='teacher' && protectedFields[0].status==='active' && protectedApproval[0].approved && loginUser.email.startsWith('integration-teacher-'),'profile save preserves role, status, approval, and Auth email');
  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=', 'base64');
  const avatarPath = `${teacher.id}/${randomUUID()}.png`;
  const avatarUpload = await uploadAvatar(avatarPath, 'image/png', pngBytes, teacher.token);
  assert(avatarUpload.ok, `Valid avatar upload failed: ${avatarUpload.status} ${JSON.stringify(avatarUpload.data)}`);
  uploadedAvatarPaths.push(avatarPath);
  await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}`,{token:service,method:'PATCH',body:{avatar_path:avatarPath}});
  const publicAvatarAccess = await success('/rest/v1/rpc/can_read_teacher_avatar',{method:'POST',body:{p_name:avatarPath}});
  check(publicAvatarAccess===true,'anonymous avatar helper permits the currently referenced approved teacher image');
  const publicAvatarRead = await request(`/storage/v1/object/sign/teacher-avatars/${avatarPath}`,{method:'POST',body:signBody});
  check(publicAvatarRead.ok,'anonymous can sign the currently referenced approved teacher avatar');
  const ownerAvatarRead = await request(`/storage/v1/object/sign/teacher-avatars/${avatarPath}`,{token:teacher.token,method:'POST',body:signBody});
  check(ownerAvatarRead.ok,'active owner can sign their currently referenced avatar');
  const unrelatedAvatarRead = await request(`/storage/v1/object/sign/teacher-avatars/${avatarPath}`,{token:otherTeacher.token,method:'POST',body:signBody});
  check(unrelatedAvatarRead.ok,'unrelated active user can sign the publicly referenced approved avatar');
  const ownUnreferencedPath = `${teacher.id}/${randomUUID()}.png`;
  const ownUnreferenced = await uploadAvatar(ownUnreferencedPath,'image/png',pngBytes,teacher.token);
  assert(ownUnreferenced.ok,`Active owner could not upload an unreferenced avatar: ${ownUnreferenced.status} ${JSON.stringify(ownUnreferenced.data)}`);
  uploadedAvatarPaths.push(ownUnreferencedPath);
  const anonUnreferenced = await success('/rest/v1/rpc/can_read_teacher_avatar',{method:'POST',body:{p_name:ownUnreferencedPath}});
  const anonUnreferencedSign = await request(`/storage/v1/object/sign/teacher-avatars/${ownUnreferencedPath}`,{method:'POST',body:signBody});
  const ownerUnreferenced = await request(`/storage/v1/object/sign/teacher-avatars/${ownUnreferencedPath}`,{token:teacher.token,method:'POST',body:signBody});
  check(anonUnreferenced===false && !anonUnreferencedSign.ok && ownerUnreferenced.ok,'unreferenced avatar is private to anonymous viewers while its active owner can access it');
  const ownerDelete = await request('/storage/v1/object/teacher-avatars',{token:teacher.token,method:'DELETE',body:{prefixes:[ownUnreferencedPath]}});
  assert(ownerDelete.ok,`Owner avatar cleanup failed: ${ownerDelete.status} ${JSON.stringify(ownerDelete.data)}`);
  assert(Array.isArray(ownerDelete.data) && ownerDelete.data.some(row=>row.name===ownUnreferencedPath),`Owner delete did not return the deleted object: ${JSON.stringify(ownerDelete.data)}`);
  check(ownerDelete.ok,'owner can delete an unreferenced avatar for upload compensation');
  uploadedAvatarPaths.splice(uploadedAvatarPaths.indexOf(ownUnreferencedPath),1);
  const foreignPath = `${otherTeacher.id}/${randomUUID()}.png`;
  const foreignUpload = await uploadAvatar(foreignPath,'image/png',pngBytes,teacher.token);
  check(!foreignUpload.ok,'teacher cannot upload under another teacher UUID prefix');
  const invalidPath = `${teacher.id}/not-a-uuid.svg`;
  const invalidPathUpload = await uploadAvatar(invalidPath,'image/svg+xml',pngBytes,teacher.token);
  check(!invalidPathUpload.ok,'avatar storage rejects SVG and malformed object paths');
  const mismatchedPath = `${teacher.id}/${randomUUID()}.jpg`;
  const mismatchedUpload = await uploadAvatar(mismatchedPath,'image/png',pngBytes,teacher.token);
  check(!mismatchedUpload.ok,'avatar storage rejects an extension and MIME mismatch');
  const tooLargePath = `${teacher.id}/${randomUUID()}.png`;
  const tooLargeUpload = await uploadAvatar(tooLargePath,'image/png',Buffer.alloc(2097153),teacher.token);
  check(!tooLargeUpload.ok,'avatar storage enforces the 2 MiB upload cap');

  const initialCoverPath = `${teacher.id}/cover/${randomUUID()}.png`;
  const coverPngAtLimit = Buffer.alloc(2097152);
  pngBytes.copy(coverPngAtLimit);
  const boundaryCoverUpload = await uploadAvatar(initialCoverPath,'image/png',coverPngAtLimit,teacher.token);
  assert(boundaryCoverUpload.ok,`Cover upload at exactly 2 MiB failed: ${boundaryCoverUpload.status} ${JSON.stringify(boundaryCoverUpload.data)}`);
  uploadedCoverPaths.push(initialCoverPath);
  const emptyPublicCoverPath = await success('/rest/v1/rpc/public_teacher_cover_path',{method:'POST',body:{p_teacher_id:teacher.id}});
  const emptyOwnerCoverPath = await success('/rest/v1/rpc/public_teacher_cover_path',{token:teacher.token,method:'POST',body:{p_teacher_id:teacher.id}});
  check(emptyPublicCoverPath===null && emptyOwnerCoverPath===null,'cover projection returns null for an eligible teacher without a cover');
  const coverSaved = await success('/rest/v1/rpc/set_teacher_cover_path',{token:teacher.token,method:'POST',body:{p_cover_path:initialCoverPath,p_expected_path:null}});
  check(coverSaved===true,'active teacher can set a cover with compare-and-set');
  const anonymousRawCoverRead = await request(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=cover_path`);
  check(!anonymousRawCoverRead.ok,'anonymous cover projection does not grant raw teacher_profiles reads');
  const rawCoverClear = await request(`/rest/v1/teacher_profiles?id=eq.${teacher.id}`,{token:teacher.token,method:'PATCH',body:{cover_path:null}});
  const coverAfterRawClear = (await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=cover_path`,{token:service}))[0].cover_path;
  check((!rawCoverClear.ok || rawCoverClear.data.length===0) && coverAfterRawClear===initialCoverPath,'active teacher cannot bypass compare-and-set with a raw cover update');
  const directAvatarWrite = await request(`/rest/v1/teacher_profiles?id=eq.${teacher.id}`,{token:teacher.token,method:'PATCH',body:{avatar_path:avatarPath}});
  const avatarAfterRawWrite = (await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=avatar_path`,{token:service}))[0].avatar_path;
  check((!directAvatarWrite.ok || directAvatarWrite.data.length===0) && avatarAfterRawWrite===avatarPath,'active teacher cannot bypass avatar compare-and-set with a raw column update');
  const competingAvatarPaths = [`${teacher.id}/${randomUUID()}.webp`,`${teacher.id}/${randomUUID()}.jpg`];
  const competingAvatarUploads = await Promise.all([
    uploadAvatar(competingAvatarPaths[0],'image/webp',Buffer.from('UklGRgAAAABXRUJQVlA4','ascii'),teacher.token),
    uploadAvatar(competingAvatarPaths[1],'image/jpeg',Buffer.from([0xff,0xd8,0xff,0xe0]),teacher.token),
  ]);
  assert(competingAvatarUploads.every(result=>result.ok),`Competing avatar fixtures uploaded: ${JSON.stringify(competingAvatarUploads)}`);
  uploadedAvatarPaths.push(...competingAvatarPaths);
  const concurrentAvatarSaves = await Promise.all(competingAvatarPaths.map(path=>
    request('/rest/v1/rpc/set_teacher_avatar_path',{token:teacher.token,method:'POST',body:{p_avatar_path:path,p_expected_path:avatarPath}})
  ));
  assert(concurrentAvatarSaves.every(result=>result.ok),`Concurrent avatar saves failed: ${JSON.stringify(concurrentAvatarSaves)}`);
  const avatarWinnerPath = (await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=avatar_path`,{token:service}))[0].avatar_path;
  check(concurrentAvatarSaves.filter(result=>result.data===true).length===1 && competingAvatarPaths.includes(avatarWinnerPath),'concurrent avatar compare-and-set replacements have one winner');
  const staleAvatarRemoval = await success('/rest/v1/rpc/set_teacher_avatar_path',{token:teacher.token,method:'POST',body:{p_avatar_path:null,p_expected_path:avatarPath}});
  const avatarAfterStaleRemoval = (await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=avatar_path`,{token:service}))[0].avatar_path;
  check(staleAvatarRemoval===false && avatarAfterStaleRemoval===avatarWinnerPath,'stale avatar removal leaves the concurrent winning photo selected');
  const publicCoverAccess = await success('/rest/v1/rpc/can_read_teacher_cover',{method:'POST',body:{p_name:initialCoverPath}});
  const publicCoverPath = await success('/rest/v1/rpc/public_teacher_cover_path',{method:'POST',body:{p_teacher_id:teacher.id}});
  const publicCoverRead = await request(`/storage/v1/object/sign/teacher-avatars/${initialCoverPath.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',body:signBody});
  check(publicCoverAccess===true && publicCoverPath===initialCoverPath && publicCoverRead.ok,'anonymous projection and signing expose only the current cover of an approved teacher');
  const currentCoverDelete = await request('/storage/v1/object/teacher-avatars',{token:teacher.token,method:'DELETE',body:{prefixes:[initialCoverPath]}});
  check(!Array.isArray(currentCoverDelete.data) || !currentCoverDelete.data.some(row=>row.name===initialCoverPath),'Storage refuses to delete a currently referenced cover');
  const coverAfterDeniedDelete = await request(`/storage/v1/object/sign/teacher-avatars/${initialCoverPath.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',body:signBody});
  check(coverAfterDeniedDelete.ok,'denied concurrent cover deletion preserves the current object');
  const preservedAvatar = (await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=avatar_path`,{token:service}))[0].avatar_path;
  check(preservedAvatar===avatarWinnerPath,'cover save preserves the independent avatar reference');

  const secondCoverPath = `${teacher.id}/cover/${randomUUID()}.webp`;
  const thirdCoverPath = `${teacher.id}/cover/${randomUUID()}.jpg`;
  const webpBytes = Buffer.from('UklGRgAAAABXRUJQVlA4', 'ascii');
  const secondCoverUpload = await uploadAvatar(secondCoverPath,'image/webp',webpBytes,teacher.token);
  const thirdCoverUpload = await uploadAvatar(thirdCoverPath,'image/jpeg',Buffer.from([0xff,0xd8,0xff,0xe0]),teacher.token);
  assert(secondCoverUpload.ok && thirdCoverUpload.ok,'Cover concurrency fixtures uploaded');
  uploadedCoverPaths.push(secondCoverPath,thirdCoverPath);
  const concurrentCoverSaves = await Promise.all([
    request('/rest/v1/rpc/set_teacher_cover_path',{token:teacher.token,method:'POST',body:{p_cover_path:secondCoverPath,p_expected_path:initialCoverPath}}),
    request('/rest/v1/rpc/set_teacher_cover_path',{token:teacher.token,method:'POST',body:{p_cover_path:thirdCoverPath,p_expected_path:initialCoverPath}}),
  ]);
  assert(concurrentCoverSaves.every(result=>result.ok),`Concurrent cover saves failed: ${JSON.stringify(concurrentCoverSaves)}`);
  const currentCover = (await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=cover_path`,{token:service}))[0].cover_path;
  check(concurrentCoverSaves.filter(result=>result.data===true).length===1 && [secondCoverPath,thirdCoverPath].includes(currentCover),'concurrent compare-and-set cover replacements have one winner');
  const failedSavePath = `${teacher.id}/cover/${randomUUID()}.png`;
  const failedSaveUpload = await uploadAvatar(failedSavePath,'image/png',pngBytes,teacher.token);
  assert(failedSaveUpload.ok,'Failed-save cover fixture uploaded');
  uploadedCoverPaths.push(failedSavePath);
  const failedMetadataSave = await success('/rest/v1/rpc/set_teacher_cover_path',{token:teacher.token,method:'POST',body:{p_cover_path:failedSavePath,p_expected_path:initialCoverPath}});
  const afterFailedCoverSave = (await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=cover_path,avatar_path`,{token:service}))[0];
  const failedSavePublicRead = await request(`/storage/v1/object/sign/teacher-avatars/${failedSavePath.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',body:signBody});
  const failedSaveOwnerRead = await request(`/storage/v1/object/sign/teacher-avatars/${failedSavePath.split('/').map(encodeURIComponent).join('/')}`,{token:teacher.token,method:'POST',body:signBody});
  check(failedMetadataSave===false && afterFailedCoverSave.cover_path===currentCover && afterFailedCoverSave.avatar_path===avatarWinnerPath && !failedSavePublicRead.ok && failedSaveOwnerRead.ok,'failed metadata save keeps the current cover and avatar while the new object stays private');
  const failedCoverDelete = await request('/storage/v1/object/teacher-avatars',{token:teacher.token,method:'DELETE',body:{prefixes:[failedSavePath]}});
  assert(failedCoverDelete.ok && failedCoverDelete.data.some(row=>row.name===failedSavePath),'owner can clean an unreferenced cover after a failed save');
  uploadedCoverPaths.splice(uploadedCoverPaths.indexOf(failedSavePath),1);
  const foreignCoverPath = `${otherTeacher.id}/cover/${randomUUID()}.png`;
  const foreignCoverUpload = await uploadAvatar(foreignCoverPath,'image/png',pngBytes,teacher.token);
  check(!foreignCoverUpload.ok,'teacher cannot upload a cover under a foreign owner UUID');
  const avatarKindSpoof = await uploadAvatar(`${teacher.id}/${randomUUID()}/cover.png`,'image/png',pngBytes,teacher.token);
  check(!avatarKindSpoof.ok,'cover kind path cannot be uploaded through the avatar contract');
  const overLimitCoverPath = `${teacher.id}/cover/${randomUUID()}.png`;
  const overLimitCoverUpload = await uploadAvatar(overLimitCoverPath,'image/png',Buffer.alloc(2097153),teacher.token);
  check(!overLimitCoverUpload.ok,'cover storage rejects files larger than 2 MiB');

  const pendingCoverPath = `${pendingTeacher.id}/cover/${randomUUID()}.png`;
  const pendingCoverUpload = await uploadAvatar(pendingCoverPath,'image/png',pngBytes,pendingTeacher.token);
  assert(pendingCoverUpload.ok,'Unapproved active teacher can upload a private cover');
  uploadedCoverPaths.push(pendingCoverPath);
  const pendingCoverSaved = await success('/rest/v1/rpc/set_teacher_cover_path',{token:pendingTeacher.token,method:'POST',body:{p_cover_path:pendingCoverPath,p_expected_path:null}});
  const pendingPublicCoverPath = await success('/rest/v1/rpc/public_teacher_cover_path',{method:'POST',body:{p_teacher_id:pendingTeacher.id}});
  const pendingOwnerRead = await request(`/storage/v1/object/sign/teacher-avatars/${pendingCoverPath.split('/').map(encodeURIComponent).join('/')}`,{token:pendingTeacher.token,method:'POST',body:signBody});
  const pendingPublicRead = await request(`/storage/v1/object/sign/teacher-avatars/${pendingCoverPath.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',body:signBody});
  check(pendingCoverSaved===true && pendingPublicCoverPath===null && pendingOwnerRead.ok && !pendingPublicRead.ok,'pending teacher can sign their own cover while public projection and signing remain hidden');

  await success(`/rest/v1/teacher_profiles?id=eq.${otherTeacher.id}`,{token:service,method:'PATCH',body:{approved:false}});
  await success('/rest/v1/teacher_specializations',{token:service,method:'POST',body:{teacher_id:otherTeacher.id,offering_id:offerings[0].id}});
  const hiddenSpecializations = await success('/rest/v1/rpc/public_teacher_specializations',{method:'POST',body:{p_teacher_id:otherTeacher.id}});
  check(hiddenSpecializations.length===0,'public specialization RPC hides an unapproved teacher');
  const unapprovedAvatarPath = `${otherTeacher.id}/${randomUUID()}.png`;
  const unapprovedUpload = await uploadAvatar(unapprovedAvatarPath,'image/png',pngBytes,otherTeacher.token);
  assert(unapprovedUpload.ok,`Active unapproved teacher upload failed: ${unapprovedUpload.status} ${JSON.stringify(unapprovedUpload.data)}`);
  uploadedAvatarPaths.push(unapprovedAvatarPath);
  await success(`/rest/v1/teacher_profiles?id=eq.${otherTeacher.id}`,{token:service,method:'PATCH',body:{avatar_path:unapprovedAvatarPath}});
  const unapprovedPublicAccess = await success('/rest/v1/rpc/can_read_teacher_avatar',{method:'POST',body:{p_name:unapprovedAvatarPath}});
  const unapprovedPublicRead = await request(`/storage/v1/object/sign/teacher-avatars/${unapprovedAvatarPath}`,{method:'POST',body:signBody});
  check(unapprovedPublicAccess===false && !unapprovedPublicRead.ok,'unapproved teacher avatar remains hidden from anonymous viewers when referenced');
  const unapprovedOwnerRead = await request(`/storage/v1/object/sign/teacher-avatars/${unapprovedAvatarPath}`,{token:otherTeacher.token,method:'POST',body:signBody});
  check(unapprovedOwnerRead.ok,'active unapproved teacher can sign their own avatar');
  await success(`/rest/v1/teacher_profiles?id=eq.${otherTeacher.id}`,{token:service,method:'PATCH',body:{approved:true}});
  const approvedPublicRead = await request(`/storage/v1/object/sign/teacher-avatars/${unapprovedAvatarPath}`,{method:'POST',body:signBody});
  check(approvedPublicRead.ok,'referenced avatar becomes public after its teacher is approved');
  const visibleSpecializations = await success('/rest/v1/rpc/public_teacher_specializations',{method:'POST',body:{p_teacher_id:otherTeacher.id}});
  check(visibleSpecializations.some(row=>row.offering_id===offerings[0].id),'public specialization RPC exposes offerings for an approved active teacher');
  const customSubjectId = randomUUID();
  const customNodeId = randomUUID();
  const customOfferingId = randomUUID();
  await success('/rest/v1/subjects',{token:service,method:'POST',body:{id:customSubjectId,owner_teacher_id:teacher.id,name_ar:'مادة REST خاصة',name_en:'REST private subject',slug:customSubjectId}});
  await success('/rest/v1/education_nodes',{token:service,method:'POST',body:{id:customNodeId,parent_id:null,kind:'student_category',name_ar:'فئة REST خاصة',name_en:'REST private category',slug:customNodeId,owner_teacher_id:teacher.id}});
  await success('/rest/v1/offerings',{token:service,method:'POST',body:{id:customOfferingId,node_id:customNodeId,subject_id:customSubjectId,owner_teacher_id:teacher.id}});
  const ownerPrivateSubject = await success(`/rest/v1/subjects?id=eq.${customSubjectId}`,{token:teacher.token});
  const peerPrivateSubject = await success(`/rest/v1/subjects?id=eq.${customSubjectId}`,{token:otherTeacher.token});
  const anonymousPrivateSubject = await success(`/rest/v1/subjects?id=eq.${customSubjectId}`);
  const draftCatalogue = await success('/rest/v1/rpc/public_discovery_catalogue',{method:'POST',body:{}});
  check(ownerPrivateSubject.length===1 && peerPrivateSubject.length===0 && anonymousPrivateSubject.length===0 && !draftCatalogue.subjects.some(row=>row.id===customSubjectId),'private custom catalogue labels stay owner-only and out of public discovery while unreferenced');
  const spoofOwner = await request(`/rest/v1/subjects?id=eq.${customSubjectId}`,{token:teacher.token,method:'PATCH',body:{owner_teacher_id:otherTeacher.id}});
  const retainedOwner = await success(`/rest/v1/subjects?id=eq.${customSubjectId}&select=owner_teacher_id`,{token:service});
  check((!spoofOwner.ok || spoofOwner.data.length===0) && retainedOwner[0]?.owner_teacher_id===teacher.id,'catalogue owner cannot be forged through the REST API');
  const adminOwnerSpoof = await request(`/rest/v1/subjects?id=eq.${customSubjectId}`,{token:spoof.token,method:'PATCH',body:{owner_teacher_id:otherTeacher.id}});
  const adminDeleteOwned = await request(`/rest/v1/subjects?id=eq.${customSubjectId}`,{token:spoof.token,method:'DELETE'});
  const retainedOwnedSubject = await success(`/rest/v1/subjects?id=eq.${customSubjectId}`,{token:service});
  const adminLabelChange = await request(`/rest/v1/subjects?id=eq.${customSubjectId}`,{token:spoof.token,method:'PATCH',body:{name_en:'Forged private label'}});
  const adminKindChange = await request(`/rest/v1/education_nodes?id=eq.${customNodeId}`,{token:spoof.token,method:'PATCH',body:{kind:'year'}});
  const adminPairChange = await request(`/rest/v1/offerings?id=eq.${customOfferingId}`,{token:spoof.token,method:'PATCH',body:{node_id:offerings[0].node_id}});
  check(!adminOwnerSpoof.ok && !adminDeleteOwned.ok && !adminLabelChange.ok && !adminKindChange.ok && !adminPairChange.ok && retainedOwnedSubject.length===1,'admin cannot reassign, relabel, physically delete, reshape, or relink owned catalogue rows');
  const rpcSubjectId = await success('/rest/v1/rpc/save_teacher_subject',{token:teacher.token,method:'POST',body:{p_id:null,p_name_ar:'  مادة RPC خاصة  ',p_name_en:''}});
  const rpcCategoryId = await success('/rest/v1/rpc/save_teacher_category',{token:teacher.token,method:'POST',body:{p_id:null,p_kind:'student_category',p_name_ar:'',p_name_en:' RPC category '}});
  const concurrentPairs = await Promise.all([1,2].map(()=>request('/rest/v1/rpc/save_teacher_offering',{token:teacher.token,method:'POST',body:{p_subject_id:rpcSubjectId,p_category_id:rpcCategoryId}})));
  check(concurrentPairs.every(result=>result.ok) && concurrentPairs[0].data===concurrentPairs[1].data,'concurrent pair requests reuse one teacher-owned offering');
  const rpcOfferingId = concurrentPairs[0].data;
  const foreignRename = await request('/rest/v1/rpc/save_teacher_subject',{token:otherTeacher.token,method:'POST',body:{p_id:rpcSubjectId,p_name_ar:'Foreign edit',p_name_en:''}});
  const lockApp = `task2b_catalogue_lock_${suffix}`;
  const holderSql = `begin; select pg_advisory_xact_lock(hashtextextended('teacher-calendar:${teacher.id}',0)); select pg_sleep(3); commit;`;
  const lockHolder = spawn('docker',['exec','-e',`PGAPPNAME=${lockApp}`,'supabase_db_private-teachers','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',holderSql],{stdio:'ignore'});
  const holderExit = new Promise(resolve=>lockHolder.once('exit',resolve));
  const lockQuery = `select count(*) from pg_stat_activity a join pg_locks l on l.pid=a.pid where a.application_name='${lockApp}' and l.locktype='advisory' and l.granted`;
  let holderReady = false;
  for (let attempt=0;attempt<40 && !holderReady;attempt++) {
    await wait(50);
    holderReady = execFileSync('docker',['exec','supabase_db_private-teachers','psql','-U','postgres','-d','postgres','-Atc',lockQuery],{encoding:'utf8'}).trim()==='1';
  }
  assert(holderReady,'Local advisory-lock fixture became active');
  const queuedSubjectSave = request('/rest/v1/rpc/save_teacher_subject',{token:teacher.token,method:'POST',body:{p_id:null,p_name_ar:'Suspended while queued',p_name_en:''}});
  const queuedQuery = `select count(*) from pg_stat_activity where query ilike '%save_teacher_subject%' and wait_event_type='Lock'`;
  let saveIsQueued = false;
  for (let attempt=0;attempt<40 && !saveIsQueued;attempt++) {
    await wait(50);
    saveIsQueued = execFileSync('docker',['exec','supabase_db_private-teachers','psql','-U','postgres','-d','postgres','-Atc',queuedQuery],{encoding:'utf8'}).trim()==='1';
  }
  assert(saveIsQueued,'Catalogue mutation waited for the teacher calendar lock');
  await success(`/rest/v1/profiles?id=eq.${teacher.id}`,{token:service,method:'PATCH',body:{status:'suspended'}});
  const suspendedQueuedSave = await queuedSubjectSave;
  await success(`/rest/v1/profiles?id=eq.${teacher.id}`,{token:service,method:'PATCH',body:{status:'active'}});
  await holderExit;
  const suspendedWriteRows = await success(`/rest/v1/subjects?owner_teacher_id=eq.${teacher.id}&name_ar=eq.Suspended%20while%20queued&select=id`,{token:service});
  check(!suspendedQueuedSave.ok && suspendedQueuedSave.data?.code==='42501' && suspendedWriteRows.length===0,'a teacher suspended while queued cannot mutate after the calendar lock releases');
  const rpcDraftId = await success('/rest/v1/rpc/save_teacher_group_draft',{token:teacher.token,method:'POST',body:{p_group_id:null,p_subject_id:rpcSubjectId,p_category_id:rpcCategoryId,p_name:`RPC ${suffix}`,p_description:'Atomic draft',p_capacity:8,p_location:'Cairo',p_expected_updated_at:null}});
  const rpcDraftBefore = (await success(`/rest/v1/groups?id=eq.${rpcDraftId}&select=updated_at,name,offering_id`,{token:teacher.token}))[0];
  const rpcDraftSaved = await success('/rest/v1/rpc/save_teacher_group_draft',{token:teacher.token,method:'POST',body:{p_group_id:rpcDraftId,p_subject_id:rpcSubjectId,p_category_id:rpcCategoryId,p_name:`RPC ${suffix} updated`,p_description:'Saved',p_capacity:9,p_location:'Giza',p_expected_updated_at:rpcDraftBefore.updated_at}});
  const staleNewSubject = await success('/rest/v1/rpc/save_teacher_subject',{token:teacher.token,method:'POST',body:{p_id:null,p_name_ar:'Stale subject',p_name_en:''}});
  const staleDraftSave = await request('/rest/v1/rpc/save_teacher_group_draft',{token:teacher.token,method:'POST',body:{p_group_id:rpcDraftId,p_subject_id:staleNewSubject,p_category_id:rpcCategoryId,p_name:'Must not save',p_description:'',p_capacity:10,p_location:'',p_expected_updated_at:rpcDraftBefore.updated_at}});
  const danglingStalePair = await success(`/rest/v1/offerings?owner_teacher_id=eq.${teacher.id}&subject_id=eq.${staleNewSubject}&select=id`,{token:service});
  check(!foreignRename.ok && rpcDraftSaved===rpcDraftId && !staleDraftSave.ok && danglingStalePair.length===0,'catalogue rename ownership and atomic draft timestamp CAS reject foreign or stale writes before pair creation');
  const archiveSaveRaceGroup = await Promise.all([
    request('/rest/v1/rpc/set_teacher_catalogue_archived',{token:teacher.token,method:'POST',body:{p_kind:'offering',p_id:rpcOfferingId,p_archived:true}}),
    request('/rest/v1/rpc/save_teacher_group_draft',{token:teacher.token,method:'POST',body:{p_group_id:null,p_subject_id:rpcSubjectId,p_category_id:rpcCategoryId,p_name:`Race ${suffix}`,p_description:'',p_capacity:5,p_location:'',p_expected_updated_at:null}}),
  ]);
  const raceGroup = archiveSaveRaceGroup[1].ok ? await success(`/rest/v1/groups?id=eq.${archiveSaveRaceGroup[1].data}&select=offering_id,status`,{token:service}) : [];
  check(archiveSaveRaceGroup[0].ok && (!archiveSaveRaceGroup[1].ok || (raceGroup.length===1 && raceGroup[0].offering_id===rpcOfferingId && raceGroup[0].status==='draft')),'archive and draft-save race serializes without a foreign or dangling pair');
  const customDraft = (await success('/rest/v1/groups',{token:service,method:'POST',body:{teacher_id:teacher.id,offering_id:customOfferingId,name:`Custom ${suffix}`,capacity:5,status:'draft',updated_at:'2100-01-01T00:00:00Z'}}))[0];
  const foreignCustomGroup = await request('/rest/v1/groups',{token:otherTeacher.token,method:'POST',body:{teacher_id:otherTeacher.id,offering_id:customOfferingId,name:'Foreign custom pair',capacity:5,status:'draft'}});
  const sharedStudentChoice = await success(`/rest/v1/student_profiles?id=eq.${student.id}`,{token:student.token,method:'PATCH',body:{offering_id:offerings[0].id}});
  const studentCustomChoice = await request(`/rest/v1/student_profiles?id=eq.${student.id}`,{token:student.token,method:'PATCH',body:{offering_id:customOfferingId}});
  check(Boolean(customDraft?.id) && customDraft.updated_at!=='2100-01-01T00:00:00Z' && sharedStudentChoice[0]?.offering_id===offerings[0].id && !foreignCustomGroup.ok && !studentCustomChoice.ok,'REST guards allow shared student selection and reject foreign or owned selections and forged updated_at');
  await success('/rest/v1/teacher_specializations',{token:teacher.token,method:'POST',body:{teacher_id:teacher.id,offering_id:customOfferingId}});
  const hiddenCustomSpecialization = await success('/rest/v1/rpc/public_teacher_specializations',{method:'POST',body:{p_teacher_id:teacher.id}});
  check(!hiddenCustomSpecialization.some(row=>row.offering_id===customOfferingId),'public specialization omits a custom pair until that same teacher publishes it');
  await success('/rest/v1/rpc/save_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:customDraft.id,p_weekday:4,p_start_time:'14:00',p_end_time:'15:00'}});
  await success('/rest/v1/rpc/publish_group',{token:teacher.token,method:'POST',body:{p_group_id:customDraft.id,p_from:null,p_until:null}});
  const publishedCustomSubject = await success(`/rest/v1/subjects?id=eq.${customSubjectId}`,{token:otherTeacher.token});
  const visibleCustomSpecialization = await success('/rest/v1/rpc/public_teacher_specializations',{method:'POST',body:{p_teacher_id:teacher.id}});
  const publishedCatalogue = await success('/rest/v1/rpc/public_discovery_catalogue',{method:'POST',body:{}});
  check(publishedCustomSubject.length===1 && visibleCustomSpecialization.some(row=>row.offering_id===customOfferingId) && publishedCatalogue.subjects.some(row=>row.id===customSubjectId) && publishedCatalogue.nodes.some(row=>row.id===customNodeId),'eligible published custom pair becomes readable and discoverable with exact specialization visibility');
  const customEnrollment = await success('/rest/v1/rpc/request_enrollment',{token:student.token,method:'POST',body:{p_group_id:customDraft.id}});
  await success('/rest/v1/rpc/decide_enrollment',{token:teacher.token,method:'POST',body:{p_enrollment_id:customEnrollment,p_status:'accepted'}});
  const themeProfileBase = {
    about:{ar:'',en:''},approach:{ar:'',en:''},goals:{ar:'',en:''},qualifications:[],experience:[],
    languages:[],city:{ar:'',en:''},teaching_mode:null,
    section_order:['about','qualifications','experience','approach','goals'],hidden_sections:[],
  };
  let themeVersion = (await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${otherTeacher.id}&select=version`,{token:otherTeacher.token}))[0].version;
  const indigoThemeSave = await request('/rest/v1/rpc/save_teacher_profile_details',{token:otherTeacher.token,method:'POST',body:{p_details:{...themeProfileBase,layout:'compact',palette:'indigo'},p_expected_version:themeVersion}});
  assert(indigoThemeSave.ok,'Teacher can save theme-only compact/indigo profile details');
  themeVersion = indigoThemeSave.data;
  const indigoThemeProjection = await success('/rest/v1/rpc/public_teacher_profile_details',{method:'POST',body:{p_teacher_id:otherTeacher.id}});
  check(indigoThemeProjection?.layout==='compact' && indigoThemeProjection?.palette==='indigo' && indigoThemeProjection.sections.length===0,'anonymous RPC returns theme-only compact/indigo settings with no visible sections');
  const oliveThemeSave = await request('/rest/v1/rpc/save_teacher_profile_details',{token:otherTeacher.token,method:'POST',body:{p_details:{...themeProfileBase,layout:'classic',palette:'olive'},p_expected_version:themeVersion}});
  assert(oliveThemeSave.ok,'Teacher can save theme-only olive profile details');
  themeVersion = oliveThemeSave.data;
  const oliveThemeProjection = await success('/rest/v1/rpc/public_teacher_profile_details',{method:'POST',body:{p_teacher_id:otherTeacher.id}});
  check(oliveThemeProjection?.layout==='classic' && oliveThemeProjection?.palette==='olive' && oliveThemeProjection.sections.length===0,'anonymous RPC returns theme-only olive palette with no visible sections');
  const fullyHiddenSave = await request('/rest/v1/rpc/save_teacher_profile_details',{token:otherTeacher.token,method:'POST',body:{p_details:{...themeProfileBase,about:{ar:'Hidden theme secret',en:'Hidden theme secret'},approach:{ar:'Hidden approach',en:'Hidden approach'},goals:{ar:'Hidden goals',en:'Hidden goals'},layout:'compact',palette:'olive',hidden_sections:['about','qualifications','experience','approach','goals']},p_expected_version:themeVersion}});
  assert(fullyHiddenSave.ok,'Teacher can save non-default appearance with all sections hidden');
  const fullyHiddenProjection = await success('/rest/v1/rpc/public_teacher_profile_details',{method:'POST',body:{p_teacher_id:otherTeacher.id}});
  check(fullyHiddenProjection?.layout==='compact' && fullyHiddenProjection?.palette==='olive' && fullyHiddenProjection.sections.length===0 && !JSON.stringify(fullyHiddenProjection).includes('Hidden theme'),'anonymous RPC preserves non-default appearance without exposing fully hidden section values');
  await success(`/rest/v1/teacher_profiles?id=eq.${otherTeacher.id}`,{token:service,method:'PATCH',body:{approved:false}});
  const pendingThemeProjection = await success('/rest/v1/rpc/public_teacher_profile_details',{method:'POST',body:{p_teacher_id:otherTeacher.id}});
  check(pendingThemeProjection===null,'unapproved teacher with saved non-default appearance remains hidden');
  await success(`/rest/v1/teacher_profiles?id=eq.${otherTeacher.id}`,{token:service,method:'PATCH',body:{approved:true}});
  await success(`/rest/v1/profiles?id=eq.${otherTeacher.id}`,{token:service,method:'PATCH',body:{status:'suspended'}});
  const suspendedThemeProjection = await success('/rest/v1/rpc/public_teacher_profile_details',{method:'POST',body:{p_teacher_id:otherTeacher.id}});
  check(suspendedThemeProjection===null,'suspended teacher with saved non-default appearance remains hidden');
  await success(`/rest/v1/profiles?id=eq.${otherTeacher.id}`,{token:service,method:'PATCH',body:{status:'active'}});
  const privateLessons = await success(`/rest/v1/lessons?id=eq.${lessonId}`,{token:pending.token});
  check(privateLessons.length===0,'pending student cannot read private lessons');
  const memberLessons = await success(`/rest/v1/lessons?id=eq.${lessonId}`,{token:member.token});
  check(memberLessons.length===1,'accepted student can read their lesson');
  const objectPath = `${teacher.id}/${lessonId}/${randomUUID()}.pdf`;
  const upload = await fetch(`${origin}/storage/v1/object/lesson-materials/${objectPath}`, {method:'POST',headers:{apikey:anon,Authorization:`Bearer ${teacher.token}`,'Content-Type':'application/pdf'},body:'%PDF-1.4\n%%EOF'});
  assert(upload.ok, `Teacher upload failed: ${upload.status} ${await upload.text()}`);
  uploadedPaths.push(objectPath);
  await success('/rest/v1/lesson_materials',{token:teacher.token,method:'POST',body:{lesson_id:lessonId,kind:'file',title:'Test PDF',storage_path:objectPath,file_size:14,mime_type:'application/pdf',uploaded_by:teacher.id}});
  const memberDownload = await request(`/storage/v1/object/sign/lesson-materials/${objectPath}`,{token:member.token,method:'POST',body:signBody});
  check(memberDownload.ok,'accepted student can obtain a private download');
  const anonymousLessonDownload = await request(`/storage/v1/object/sign/lesson-materials/${objectPath}`,{method:'POST',body:signBody});
  check(!anonymousLessonDownload.ok,'anonymous viewers cannot obtain a private lesson download');
  const pendingDownload = await request(`/storage/v1/object/sign/lesson-materials/${objectPath}`,{token:pending.token,method:'POST',body:signBody});
  check(!pendingDownload.ok,'pending student cannot obtain a private download');
  const goodLink = (await success('/rest/v1/lesson_materials',{token:teacher.token,method:'POST',body:{lesson_id:lessonId,kind:'link',title:'Reference',url:'https://example.com/lesson',uploaded_by:teacher.id}}))[0];
  const note = (await success('/rest/v1/lesson_materials',{token:teacher.token,method:'POST',body:{lesson_id:lessonId,kind:'note',title:'Reminder',content:'Bring the worksheet.',uploaded_by:teacher.id}}))[0];
  check(Boolean(goodLink?.id&&note?.id), 'teacher can add link and note materials without storage paths');
  const foreignDelete = await request(`/rest/v1/lesson_materials?id=eq.${goodLink.id}`,{token:otherTeacher.token,method:'DELETE'});
  const linkStillExists = await success(`/rest/v1/lesson_materials?id=eq.${goodLink.id}`,{token:teacher.token});
  check((!foreignDelete.ok || foreignDelete.data.length===0) && linkStillExists.length===1, 'teacher cannot delete another teacher material');
  await success(`/rest/v1/lesson_materials?id=eq.${note.id}`,{token:teacher.token,method:'DELETE'});
  const deletedNote = await success(`/rest/v1/lesson_materials?id=eq.${note.id}`,{token:teacher.token});
  check(deletedNote.length===0, 'teacher can delete their lesson material metadata');
  const fakeLink = await request('/rest/v1/lesson_materials',{token:teacher.token,method:'POST',body:{lesson_id:lessonId,kind:'link',title:'Unsafe',url:'javascript:alert(1)',uploaded_by:teacher.id}});
  check(!fakeLink.ok,'database rejects unsafe material link');
  const credentialLink = await request('/rest/v1/lesson_materials',{token:teacher.token,method:'POST',body:{lesson_id:lessonId,kind:'link',title:'Unsafe credentials',url:'https://user:password@example.com/private',uploaded_by:teacher.id}});
  check(!credentialLink.ok,'database rejects credential-bearing material links');
  await success(`/rest/v1/profiles?id=eq.${member.id}`,{token:service,method:'PATCH',body:{status:'suspended'}});
  const suspendedMemberContacts = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`,{token:member.token});
  check(suspendedMemberContacts.length===0,'suspended accepted student loses enrolled-only teacher contact access');
  const suspendedMemberLessons = await success(`/rest/v1/lessons?id=eq.${lessonId}`,{token:member.token});
  check(suspendedMemberLessons.length===0,'suspended accepted student loses lesson access immediately');
  const suspendedMemberDownload = await request(`/storage/v1/object/sign/lesson-materials/${objectPath}`,{token:member.token,method:'POST',body:signBody});
  check(!suspendedMemberDownload.ok,'suspended accepted student cannot obtain a new private download');
  await success(`/rest/v1/profiles?id=eq.${member.id}`,{token:service,method:'PATCH',body:{status:'active'}});
  await success('/rest/v1/rpc/decide_enrollment',{token:teacher.token,method:'POST',body:{p_enrollment_id:accepted[0].id,p_status:'removed'}});
  const removedLessons = await success(`/rest/v1/lessons?id=eq.${lessonId}`,{token:member.token});
  check(removedLessons.length===0,'removed student loses lesson access');
  const removedDownload = await request(`/storage/v1/object/sign/lesson-materials/${objectPath}`,{token:member.token,method:'POST',body:signBody});
  check(!removedDownload.ok,'removed student cannot obtain a new private download');
  const firstGeneration = await success('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-02-01',p_until:'2027-02-14'}});
  const occurrences = await success(`/rest/v1/lessons?group_id=eq.${group.id}&slot_id=eq.${slot}&local_date=gte.2027-02-01&local_date=lte.2027-02-14&order=local_date.asc`,{token:teacher.token});
  check(firstGeneration===2 && occurrences.length===2 && occurrences.map(row=>row.local_date).join(',')==='2027-02-07,2027-02-14','generation creates each Sunday occurrence on its Cairo-local date');
  const referencedDelete = await request('/rest/v1/rpc/delete_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_slot_id:slot}});
  const retainedReferencedSlot = await success(`/rest/v1/group_schedule_slots?id=eq.${slot}`,{token:teacher.token});
  check(!referencedDelete.ok && retainedReferencedSlot.length===1,'owner cannot delete a schedule slot referenced by generated lessons');
  check(occurrences[0].starts_at==='2027-02-07T16:00:00+00:00' && occurrences[0].ends_at==='2027-02-07T18:00:00+00:00' && occurrences[1].starts_at==='2027-02-14T16:00:00+00:00' && occurrences[1].ends_at==='2027-02-14T18:00:00+00:00','generated timestamps match the Africa/Cairo slot');
  const secondGeneration = await success('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-02-01',p_until:'2027-02-14'}});
  const repeatedOccurrences = await success(`/rest/v1/lessons?group_id=eq.${group.id}&slot_id=eq.${slot}&local_date=gte.2027-02-01&local_date=lte.2027-02-14&order=local_date.asc`,{token:teacher.token});
  check(secondGeneration===0 && repeatedOccurrences.map(row=>row.id).join(',')===occurrences.map(row=>row.id).join(','),'repeat generation is idempotent and preserves lesson IDs');
  await success('/rest/v1/rpc/set_lesson_status',{token:teacher.token,method:'POST',body:{p_lesson_id:occurrences[1].id,p_status:'cancelled'}});
  const overlappingGeneration = await success('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-02-14',p_until:'2027-02-21'}});
  const afterOverlap = await success(`/rest/v1/lessons?group_id=eq.${group.id}&slot_id=eq.${slot}&local_date=gte.2027-02-01&local_date=lte.2027-02-21&order=local_date.asc`,{token:teacher.token});
  check(overlappingGeneration===1 && afterOverlap.length===3 && afterOverlap[1].id===occurrences[1].id && afterOverlap[1].status==='cancelled' && afterOverlap[2].local_date==='2027-02-21','overlapping ranges add only new dates and do not restore a cancelled occurrence');
  const parallelGeneration = await Promise.all(Array.from({length:3},()=>request('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-02-28',p_until:'2027-02-28'}})));
  check(parallelGeneration.every(r=>r.ok) && parallelGeneration.reduce((sum,r)=>sum+r.data,0)===1,'parallel identical generation inserts one occurrence');
  const feb28Occurrence = (await success(`/rest/v1/lessons?group_id=eq.${group.id}&slot_id=eq.${slot}&local_date=eq.2027-02-28`,{token:teacher.token}))[0];
  const concurrentReschedule = await Promise.all([
    request('/rest/v1/rpc/create_lesson',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_lesson_id:feb28Occurrence.id,p_title:'Moved generated occurrence',p_starts_at:'2027-02-28T17:00:00Z',p_ends_at:'2027-02-28T19:00:00Z'}}),
    request('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-02-28',p_until:'2027-02-28'}}),
  ]);
  const movedOccurrence = (await success(`/rest/v1/lessons?id=eq.${feb28Occurrence.id}`,{token:teacher.token}))[0];
  check(concurrentReschedule.every(r=>r.ok) && movedOccurrence.slot_id===slot && movedOccurrence.local_date==='2027-02-28' && movedOccurrence.starts_at==='2027-02-28T17:00:00+00:00','parallel reschedule and generation preserve the original generated identity');
  check(await success('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-02-28',p_until:'2027-02-28'}})===0,'rescheduled occurrence is not recreated at its original time');

  const generationPeer = (await success('/rest/v1/groups',{token:service,method:'POST',body:{teacher_id:teacher.id,offering_id:offerings[0].id,name:`Generation peer ${suffix}`,capacity:4,status:'draft'}}))[0];
  await success('/rest/v1/lessons',{token:service,method:'POST',body:{group_id:generationPeer.id,title:'February revival conflict',starts_at:'2027-02-14T16:30:00Z',ends_at:'2027-02-14T17:30:00Z'}});
  const reviveScheduled = await request('/rest/v1/rpc/set_lesson_status',{token:teacher.token,method:'POST',body:{p_lesson_id:occurrences[1].id,p_status:'scheduled'}});
  const reviveCompleted = await request('/rest/v1/rpc/set_lesson_status',{token:teacher.token,method:'POST',body:{p_lesson_id:occurrences[1].id,p_status:'completed'}});
  check(!reviveScheduled.ok && !reviveCompleted.ok,'cancelled generated occurrence cannot be restored into an overlapping lesson');

  const excludedDates = ['2027-03-07','2027-03-14','2027-03-07'];
  await success('/rest/v1/rpc/set_lesson_exclusions',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_dates:excludedDates}});
  const savedExclusions = await success(`/rest/v1/group_lesson_exclusions?group_id=eq.${group.id}&order=local_date.asc`,{token:teacher.token});
  check(savedExclusions.map(row=>row.local_date).join(',')==='2027-03-07,2027-03-14','exclusions save distinct local dates');
  const directExclusionWrite = await request('/rest/v1/group_lesson_exclusions',{token:teacher.token,method:'POST',body:{group_id:group.id,local_date:'2027-03-21'}});
  check(!directExclusionWrite.ok,'teachers cannot write exclusions directly');
  const skippedExclusions = await success('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-03-01',p_until:'2027-03-14'}});
  const skippedRows = await success(`/rest/v1/lessons?group_id=eq.${group.id}&local_date=gte.2027-03-01&local_date=lte.2027-03-14`,{token:teacher.token});
  check(skippedExclusions===0 && skippedRows.length===0,'generation skips all saved excluded occurrences');
  await success('/rest/v1/rpc/set_lesson_exclusions',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_dates:[]}});
  const afterClear = await success('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-03-07',p_until:'2027-03-07'}});
  check(afterClear===1,'an empty exclusion list clears saved dates for generation');
  const concurrentExclusionGeneration = await Promise.all([
    request('/rest/v1/rpc/set_lesson_exclusions',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_dates:['2027-03-14']},timeoutMs:8000}),
    request('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-03-14',p_until:'2027-03-14'},timeoutMs:8000}),
  ]);
  const concurrentExclusionRows = await success(`/rest/v1/lessons?group_id=eq.${group.id}&slot_id=eq.${slot}&local_date=eq.2027-03-14`,{token:teacher.token});
  const concurrentSavedExclusions = await success(`/rest/v1/group_lesson_exclusions?group_id=eq.${group.id}&local_date=eq.2027-03-14`,{token:teacher.token});
  const concurrentPreview = (await success('/rest/v1/rpc/preview_lesson_generation',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-03-14',p_until:'2027-03-14'}}))[0];
  check(concurrentExclusionGeneration.every(r=>r.ok) && concurrentSavedExclusions.length===1 &&
    ((concurrentExclusionRows.length===1 && concurrentExclusionGeneration[1].data===1 && concurrentPreview.state==='already_generated') ||
     (concurrentExclusionRows.length===0 && concurrentExclusionGeneration[1].data===0 && concurrentPreview.state==='excluded')),
    'concurrent exclusion and generation serialize to one coherent occurrence state');
  await success('/rest/v1/rpc/set_lesson_exclusions',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_dates:[]}});

  const previewBeforeConflict = await success('/rest/v1/rpc/preview_lesson_generation',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-04-04',p_until:'2027-04-11'}});
  check(previewBeforeConflict.map(row=>row.state).join(',')==='ready,ready','initial preview reports both unoccupied dates as ready');
  await success('/rest/v1/lessons',{token:service,method:'POST',body:{group_id:generationPeer.id,title:'Stale preview conflict',starts_at:'2027-04-11T16:30:00Z',ends_at:'2027-04-11T17:30:00Z'}});
  const previewRows = await success('/rest/v1/rpc/preview_lesson_generation',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-04-04',p_until:'2027-04-11'}});
  check(previewRows.map(row=>row.state).join(',')==='ready,conflicting','a fresh preview shows the stale row now conflicts');
  const blockedBatch = await request('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-04-04',p_until:'2027-04-11'}});
  const partialBatchRows = await success(`/rest/v1/lessons?group_id=eq.${group.id}&local_date=eq.2027-04-04`,{token:teacher.token});
  check(!blockedBatch.ok && partialBatchRows.length===0,'a conflict after an earlier ready candidate rolls back the entire batch');

  const lockOrderGroup = (await success('/rest/v1/groups',{token:service,method:'POST',body:{teacher_id:teacher.id,offering_id:offerings[0].id,name:`Lock order ${suffix}`,capacity:4,status:'draft'}}))[0];
  const lockOrderSlot = await success('/rest/v1/rpc/save_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:lockOrderGroup.id,p_weekday:0,p_start_time:'22:00',p_end_time:'23:00'}});
  const concurrentSlotMutation = await Promise.all([
    request('/rest/v1/rpc/save_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:lockOrderGroup.id,p_weekday:0,p_start_time:'21:00',p_end_time:'22:00',p_slot_id:lockOrderSlot},timeoutMs:8000}),
    request('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:lockOrderGroup.id,p_from:'2027-06-06',p_until:'2027-06-06'},timeoutMs:8000}),
  ]);
  const concurrentSlotRows = await success(`/rest/v1/lessons?group_id=eq.${lockOrderGroup.id}&slot_id=eq.${lockOrderSlot}&local_date=eq.2027-06-06`,{token:teacher.token});
  const lockOrderSlotRow = (await success(`/rest/v1/group_schedule_slots?id=eq.${lockOrderSlot}`,{token:teacher.token}))[0];
  const slotHasFinalTime = lockOrderSlotRow.start_time==='21:00:00' && lockOrderSlotRow.end_time==='22:00:00';
  const generatedAtEitherSerializedTime =
    (concurrentSlotRows[0]?.starts_at==='2027-06-06T18:00:00+00:00' && concurrentSlotRows[0]?.ends_at==='2027-06-06T19:00:00+00:00') ||
    (concurrentSlotRows[0]?.starts_at==='2027-06-06T19:00:00+00:00' && concurrentSlotRows[0]?.ends_at==='2027-06-06T20:00:00+00:00');
  if (!concurrentSlotMutation.every(r=>r.ok) || concurrentSlotRows.length!==1 || !slotHasFinalTime || !generatedAtEitherSerializedTime) {
    console.error('Slot/generation race details:',JSON.stringify({concurrentSlotMutation,concurrentSlotRows,lockOrderSlotRow}));
  }
  check(concurrentSlotMutation.every(r=>r.ok) && concurrentSlotRows.length===1 && slotHasFinalTime && generatedAtEitherSerializedTime,'parallel slot edit and generation serialize without deadlock and retain a valid serialized lesson time');
  const forgedAdmin = await request('/rest/v1/rpc/admin_update_user',{token:student.token,method:'POST',body:{p_user_id:teacher.id,p_status:'suspended'}});
  check(!forgedAdmin.ok,'ordinary user cannot invoke admin suspension');
  await success(`/rest/v1/profiles?id=eq.${otherTeacher.id}`,{token:service,method:'PATCH',body:{status:'suspended'}});
  const hiddenTeacher = await success(`/rest/v1/teacher_profiles?id=eq.${otherTeacher.id}`,{token:student.token});
  check(hiddenTeacher.length===0,'approved but suspended teacher profile is not publicly readable');
  const hiddenSlots = await success(`/rest/v1/group_schedule_slots?group_id=eq.${otherGroup.id}`);
  check(hiddenSlots.length===0,'published slots disappear when their teacher is suspended');
  await success(`/rest/v1/profiles?id=eq.${teacher.id}`,{token:service,method:'PATCH',body:{status:'suspended'}});
  await success(`/rest/v1/groups?id=eq.${customDraft.id}`,{token:service,method:'PATCH',body:{status:'archived'}});
  const suspendedCustomGroupWrite = await request('/rest/v1/groups',{token:teacher.token,method:'POST',body:{teacher_id:teacher.id,offering_id:customOfferingId,name:'Suspended custom selection',capacity:5,status:'draft'}});
  const historicalCustomSubject = await success(`/rest/v1/subjects?id=eq.${customSubjectId}`,{token:student.token});
  check(!suspendedCustomGroupWrite.ok && historicalCustomSubject.length===1,'suspension blocks new custom selection while accepted member keeps archived group labels');
  const suspendedDetailsBefore = (await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${teacher.id}&select=details,version`,{token:teacher.token}))[0];
  const suspendedRawBioWrite = await request(`/rest/v1/teacher_profiles?id=eq.${teacher.id}`,{token:teacher.token,method:'PATCH',body:{bio:'Suspended overwrite'}});
  const suspendedDetailsAfter = (await success(`/rest/v1/teacher_profile_details?teacher_id=eq.${teacher.id}&select=details,version`,{token:teacher.token}))[0];
  check((!suspendedRawBioWrite.ok || suspendedRawBioWrite.data.length===0) && suspendedDetailsAfter.version===suspendedDetailsBefore.version && JSON.stringify(suspendedDetailsAfter.details.about)===JSON.stringify(suspendedDetailsBefore.details.about),'suspended teacher cannot change canonical About through raw teacher_profiles.bio updates');
  const suspendedAvatarOwner = await request(`/storage/v1/object/sign/teacher-avatars/${avatarPath}`,{token:teacher.token,method:'POST',body:signBody});
  const suspendedAvatarPublic = await success('/rest/v1/rpc/can_read_teacher_avatar',{method:'POST',body:{p_name:avatarPath}});
  const suspendedAvatarPublicSign = await request(`/storage/v1/object/sign/teacher-avatars/${avatarPath}`,{method:'POST',body:signBody});
  const suspendedRawCoverClear = await request(`/rest/v1/teacher_profiles?id=eq.${teacher.id}`,{token:teacher.token,method:'PATCH',body:{cover_path:null}});
  const suspendedCoverCas = await request('/rest/v1/rpc/set_teacher_cover_path',{token:teacher.token,method:'POST',body:{p_cover_path:null,p_expected_path:currentCover}});
  const suspendedCoverAfterWrites = (await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}&select=cover_path`,{token:service}))[0].cover_path;
  const suspendedPublicCoverPath = await success('/rest/v1/rpc/public_teacher_cover_path',{method:'POST',body:{p_teacher_id:teacher.id}});
  check((!suspendedRawCoverClear.ok || suspendedRawCoverClear.data.length===0) && !suspendedCoverCas.ok && suspendedCoverAfterWrites===currentCover && suspendedPublicCoverPath===null,'suspended teacher cannot clear their cover and public cover projection returns null');
  const suspendedAvatarDelete = await request('/storage/v1/object/teacher-avatars',{token:teacher.token,method:'DELETE',body:{prefixes:[avatarPath]}});
  assert(suspendedAvatarDelete.ok,`Suspended avatar delete request failed: ${suspendedAvatarDelete.status} ${JSON.stringify(suspendedAvatarDelete.data)}`);
  check(!Array.isArray(suspendedAvatarDelete.data) || !suspendedAvatarDelete.data.some(row=>row.name===avatarPath),'suspended owner cannot delete their avatar through Storage');
  const retainedSuspendedAvatar = await request(`/storage/v1/object/sign/teacher-avatars/${avatarPath}`,{token:service,method:'POST',body:signBody});
  assert(retainedSuspendedAvatar.ok,'denied suspended owner deletion leaves the avatar for cleanup');
  const suspendedAvatarUpload = await uploadAvatar(`${teacher.id}/${randomUUID()}.png`,'image/png',pngBytes,teacher.token);
  check(!suspendedAvatarOwner.ok && suspendedAvatarPublic===false && !suspendedAvatarPublicSign.ok && !suspendedAvatarUpload.ok,'suspension blocks avatar reads and uploads');
  const suspendedWrite = await request('/rest/v1/rpc/create_lesson',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_title:'Should fail',p_starts_at:'2027-01-04T16:00:00Z',p_ends_at:'2027-01-04T18:00:00Z'}});
  check(!suspendedWrite.ok,'suspension blocks a previously authenticated session');
  // Management controls exercise historical safety through authenticated RPCs.
  await success('/rest/v1/rpc/admin_update_user',{token:spoof.token,method:'POST',body:{p_user_id:teacher.id,p_status:'active',p_approved:null}});
  await success('/rest/v1/rpc/admin_update_user',{token:spoof.token,method:'POST',body:{p_user_id:otherTeacher.id,p_status:'active',p_approved:null}});
  const deletableManual = await success('/rest/v1/rpc/create_lesson',{token:otherTeacher.token,method:'POST',body:{p_group_id:otherGroup.id,p_title:'Delete safely',p_starts_at:'2035-05-01T10:00:00Z',p_ends_at:'2035-05-01T11:00:00Z'}});
  const foreignLessonDelete = await request('/rest/v1/rpc/delete_manual_teacher_lesson',{token:teacher.token,method:'POST',body:{p_lesson_id:deletableManual}});
  const studentLessonDelete = await request('/rest/v1/rpc/delete_manual_teacher_lesson',{token:student.token,method:'POST',body:{p_lesson_id:deletableManual}});
  check(!foreignLessonDelete.ok && !studentLessonDelete.ok,'foreign teacher and student cannot delete a manual lesson');
  await success('/rest/v1/rpc/delete_manual_teacher_lesson',{token:otherTeacher.token,method:'POST',body:{p_lesson_id:deletableManual}});
  const absentManual = await success(`/rest/v1/lessons?id=eq.${deletableManual}`,{token:service});
  check(absentManual.length===0,'owner can delete a future manual lesson without history or files');
  const objectGuardLesson = await success('/rest/v1/rpc/create_lesson',{token:otherTeacher.token,method:'POST',body:{p_group_id:otherGroup.id,p_title:'Keep uploaded object',p_starts_at:'2036-05-01T10:00:00Z',p_ends_at:'2036-05-01T11:00:00Z'}});
  const guardPath = `${otherTeacher.id}/${objectGuardLesson}/${randomUUID()}.pdf`;
  const guardUpload = await fetch(`${origin}/storage/v1/object/lesson-materials/${guardPath}`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${otherTeacher.token}`,'Content-Type':'application/pdf'},body:'%PDF-1.4\n%%EOF'});
  assert(guardUpload.ok,`Storage-only deletion guard fixture upload failed: ${guardUpload.status}`);
  uploadedPaths.push(guardPath);
  const objectGuardDelete = await request('/rest/v1/rpc/delete_manual_teacher_lesson',{token:otherTeacher.token,method:'POST',body:{p_lesson_id:objectGuardLesson}});
  check(!objectGuardDelete.ok,'lesson deletion refuses a stored object at teacher_id/lesson_id/object-id path even without metadata');
  const emptyManagementGroup = (await success('/rest/v1/groups',{token:service,method:'POST',body:{teacher_id:otherTeacher.id,offering_id:offerings[0].id,name:`Unused ${suffix}`,capacity:4,status:'draft'}}))[0];
  const managementSlot = (await success('/rest/v1/group_schedule_slots',{token:service,method:'POST',body:{group_id:emptyManagementGroup.id,weekday:4,start_time:'10:00',end_time:'11:00'}}))[0];
  const anonGroupDelete = await request('/rest/v1/rpc/delete_unused_teacher_group',{method:'POST',body:{p_group_id:emptyManagementGroup.id}});
  const foreignGroupDelete = await request('/rest/v1/rpc/delete_unused_teacher_group',{token:teacher.token,method:'POST',body:{p_group_id:emptyManagementGroup.id}});
  check(!anonGroupDelete.ok && !foreignGroupDelete.ok,'anonymous and foreign teacher cannot delete an unused group');
  await success('/rest/v1/rpc/delete_unused_teacher_group',{token:otherTeacher.token,method:'POST',body:{p_group_id:emptyManagementGroup.id}});
  const removedManagementSchedule = await success(`/rest/v1/group_schedule_slots?id=eq.${managementSlot.id}`,{token:service});
  check(removedManagementSchedule.length===0,'owner can delete an unused draft and its schedule');
  const pendingEnrollmentId = enroll1===accepted[0].id ? enroll2 : enroll1;
  await success(`/rest/v1/enrollments?id=eq.${accepted[0].id}`,{token:service,method:'PATCH',body:{status:'accepted'}});
  await success(`/rest/v1/enrollments?id=eq.${pendingEnrollmentId}`,{token:service,method:'PATCH',body:{status:'pending'}});
  const ownerGroupLessons = await success(`/rest/v1/lessons?group_id=eq.${group.id}&select=id,starts_at,status`,{token:service});
  const preservedEnrollmentRows = await success(`/rest/v1/enrollments?group_id=eq.${group.id}&select=id,status`,{token:service});
  const storedFilesBeforeCancel = await success(`/rest/v1/lesson_materials?lesson_id=eq.${lessonId}&kind=eq.file&select=id,storage_path`,{token:service});
  const cancelledFutureCount = await success('/rest/v1/rpc/cancel_teacher_group',{token:teacher.token,method:'POST',body:{p_group_id:group.id}});
  const cancelledGroup = (await success(`/rest/v1/groups?id=eq.${group.id}&select=status`,{token:service}))[0];
  const afterCancelLessons = await success(`/rest/v1/lessons?group_id=eq.${group.id}&select=id,starts_at,status`,{token:service});
  const preservedEnrollmentsAfterCancel = await success(`/rest/v1/enrollments?group_id=eq.${group.id}&select=id,status`,{token:service});
  const preservedFilesAfterCancel = await success(`/rest/v1/lesson_materials?lesson_id=eq.${lessonId}&kind=eq.file&select=id,storage_path`,{token:service});
  check(cancelledGroup.status==='archived' && cancelledFutureCount>0 && afterCancelLessons.length===ownerGroupLessons.length && afterCancelLessons.some(row=>row.status==='cancelled'),'group cancellation archives without deleting lessons and cancels future scheduled lessons');
  check(preservedEnrollmentRows.length===preservedEnrollmentsAfterCancel.length && preservedEnrollmentsAfterCancel.some(row=>row.status==='accepted') && preservedEnrollmentsAfterCancel.some(row=>row.status==='rejected'),'group cancellation rejects pending requests while retaining accepted memberships');
  check(storedFilesBeforeCancel.length===preservedFilesAfterCancel.length,'group cancellation preserves lesson materials and stored-file metadata');
  const archivedCreate = await request('/rest/v1/rpc/create_lesson',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_title:'Stale create',p_starts_at:'2027-01-08T16:00:00Z',p_ends_at:'2027-01-08T17:00:00Z'}});
  const archivedGenerate = await request('/rest/v1/rpc/generate_lessons',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_from:'2027-01-03',p_until:'2027-01-03'}});
  const archivedReschedule = await request('/rest/v1/rpc/set_lesson_status',{token:teacher.token,method:'POST',body:{p_lesson_id:lessonId,p_status:'scheduled'}});
  check(!archivedCreate.ok && !archivedGenerate.ok && !archivedReschedule.ok,'stale create, generation, and reschedule actions cannot add lessons to an archived group');
  console.log(`Verified ${passed} real API assertions.`);
} finally {
  if (uploadedPaths.length) {
    const cleanup = await request('/storage/v1/object/lesson-materials',{token:service,method:'DELETE',body:{prefixes:uploadedPaths}});
    if (!cleanup.ok) console.error(`Storage fixture cleanup failed: ${cleanup.status}`);
  }
  if (uploadedAvatarPaths.length) {
    const cleanup = await request('/storage/v1/object/teacher-avatars',{token:service,method:'DELETE',body:{prefixes:uploadedAvatarPaths}});
    if (!cleanup.ok) console.error(`Avatar fixture cleanup failed: ${cleanup.status}`);
  }
  if (uploadedCoverPaths.length) {
    for (const id of users) await request(`/rest/v1/teacher_profiles?id=eq.${id}`,{token:service,method:'PATCH',body:{cover_path:null}});
    const cleanup = await request('/storage/v1/object/teacher-avatars',{token:service,method:'DELETE',body:{prefixes:uploadedCoverPaths}});
    if (!cleanup.ok) console.error(`Cover fixture cleanup failed: ${cleanup.status}`);
  }
  for (const id of users.reverse()) {
    const result = await request(`/auth/v1/admin/users/${id}`,{token:service,method:'DELETE'});
    if (!result.ok) console.error(`Fixture cleanup failed for ${id}: ${result.status}`);
  }
}
