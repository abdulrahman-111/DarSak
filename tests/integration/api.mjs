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
const uploadedAvatarPaths = [];
const signBody = {expiresIn:60};
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
  await success(`/rest/v1/profiles?id=eq.${spoof.id}`, {token:service,method:'PATCH',body:{role:'admin'}});
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
  const groupRows = await success('/rest/v1/groups', {token:teacher.token,method:'POST',body:{teacher_id:teacher.id,offering_id:offerings[0].id,name:`Integration ${suffix}`,capacity:1,status:'published'}});
  const group = groupRows[0];
  const otherGroup = (await success('/rest/v1/groups', {token:otherTeacher.token,method:'POST',body:{teacher_id:otherTeacher.id,offering_id:offerings[0].id,name:`Other ${suffix}`,capacity:4,status:'published'}}))[0];
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
  const publicGroup = await success(`/rest/v1/rpc/public_groups?id=eq.${group.id}`);
  check(publicGroup.length===1 && publicGroup[0].accepted_count===1 && publicGroup[0].available_seats===0 && publicGroup[0].teacher_name, 'anonymous discovery exposes safe capacity and teacher projection');
  const slot = await success('/rest/v1/rpc/save_schedule_slot',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_weekday:0,p_start_time:'18:00',p_end_time:'20:00'}});
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
  const otherSlot = await success('/rest/v1/rpc/save_schedule_slot',{token:otherTeacher.token,method:'POST',body:{p_group_id:otherGroup.id,p_weekday:1,p_start_time:'12:00',p_end_time:'13:00'}});
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
  check(publicContact.length===1 && publicContact[0].phone_number===null && publicContact[0].whatsapp_number==='+447911123456','explicit public opt-in permits anonymous contact read and blank normalization');
  await success(`/rest/v1/teacher_profiles?id=eq.${teacher.id}`,{token:service,method:'PATCH',body:{approved:false}});
  const unapprovedContact = await success(`/rest/v1/teacher_contacts?teacher_id=eq.${teacher.id}&select=*`);
  check(unapprovedContact.length===0,'public opt-in does not expose contacts for an unapproved teacher');
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
  const suspendedAvatarOwner = await request(`/storage/v1/object/sign/teacher-avatars/${avatarPath}`,{token:teacher.token,method:'POST',body:signBody});
  const suspendedAvatarPublic = await success('/rest/v1/rpc/can_read_teacher_avatar',{method:'POST',body:{p_name:avatarPath}});
  const suspendedAvatarPublicSign = await request(`/storage/v1/object/sign/teacher-avatars/${avatarPath}`,{method:'POST',body:signBody});
  const suspendedAvatarDelete = await request('/storage/v1/object/teacher-avatars',{token:teacher.token,method:'DELETE',body:{prefixes:[avatarPath]}});
  assert(suspendedAvatarDelete.ok,`Suspended avatar delete request failed: ${suspendedAvatarDelete.status} ${JSON.stringify(suspendedAvatarDelete.data)}`);
  check(!Array.isArray(suspendedAvatarDelete.data) || !suspendedAvatarDelete.data.some(row=>row.name===avatarPath),'suspended owner cannot delete their avatar through Storage');
  const retainedSuspendedAvatar = await request(`/storage/v1/object/sign/teacher-avatars/${avatarPath}`,{token:service,method:'POST',body:signBody});
  assert(retainedSuspendedAvatar.ok,'denied suspended owner deletion leaves the avatar for cleanup');
  const suspendedAvatarUpload = await uploadAvatar(`${teacher.id}/${randomUUID()}.png`,'image/png',pngBytes,teacher.token);
  check(!suspendedAvatarOwner.ok && suspendedAvatarPublic===false && !suspendedAvatarPublicSign.ok && !suspendedAvatarUpload.ok,'suspension blocks avatar reads and uploads');
  const suspendedWrite = await request('/rest/v1/rpc/create_lesson',{token:teacher.token,method:'POST',body:{p_group_id:group.id,p_title:'Should fail',p_starts_at:'2027-01-04T16:00:00Z',p_ends_at:'2027-01-04T18:00:00Z'}});
  check(!suspendedWrite.ok,'suspension blocks a previously authenticated session');
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
  for (const id of users.reverse()) {
    const result = await request(`/auth/v1/admin/users/${id}`,{token:service,method:'DELETE'});
    if (!result.ok) console.error(`Fixture cleanup failed for ${id}: ${result.status}`);
  }
}
