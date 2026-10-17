import 'server-only';
import { redirect } from 'next/navigation';
import type { Locale } from '@/i18n/config';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { teacherCatalogueChoices } from '@/features/teacher/catalogue-data';
import { catalogueDisplayName } from '@/features/teacher/catalogue-domain';
import { parseSetupDraft } from './domain';
import { safeSetupReturnPath } from './destination';

export async function accountSetupData(locale: Locale, requestedReturn: unknown) {
  const { db, user, profile } = await getRequestViewer();
  if (!user) redirect(`/${locale}/login`);
  if (!profile || profile.status !== 'active' || !['teacher','student'].includes(profile.role)) redirect(`/${locale}/dashboard`);
  const role = profile.role as 'teacher'|'student';
  const returnTo = safeSetupReturnPath(locale, role, requestedReturn) ?? `/${locale}/${role}`;
  if (role === 'teacher') {
    const app = await db.from('teacher_applications').select('status,legacy_approved').eq('teacher_id', user.id).maybeSingle();
    if (!app.error && app.data?.legacy_approved) redirect(returnTo);
    if (!app.error && app.data?.status === 'approved') redirect(returnTo);
    if (!app.error && app.data?.status === 'submitted') redirect(`/${locale}/account/application`);
  } else {
    const student = await db.from('student_profiles').select('onboarding_required,onboarding_completed_at').eq('id', user.id).maybeSingle();
    if (!student.error && student.data && (!student.data.onboarding_required || student.data.onboarding_completed_at !== null)) redirect(returnTo);
  }
  const draftResult = await db.rpc('get_or_create_account_setup_draft', { p_locale: locale, p_return_to: returnTo });
  const draft = draftResult.error ? null : parseSetupDraft(draftResult.data);
  const avatarResult = role === 'teacher'
    ? await db.from('teacher_profiles').select('avatar_path').eq('id', user.id).maybeSingle()
    : { data: null, error: null };
  const hasAvatar = !!avatarResult.data?.avatar_path;
  if (role === 'student' || !draft) return { db, userId: user.id, role, draft, offerings: [], subjects: [], nodes: [], hasAvatar, error: !!draftResult.error || !draft || !!avatarResult.error };
  const choices = await teacherCatalogueChoices(db, user.id);
  const nodes = choices.nodes;
  const offerings = choices.offerings.map(offering => {
    const subject = choices.subjects.find(row => row.id === offering.subject_id);
    if (!subject) return null;
    const names: string[] = [];
    let node = nodes.find(row => row.id === offering.node_id);
    const seen = new Set<string>();
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      names.unshift(catalogueDisplayName(node, locale));
      node = node.parent_id ? nodes.find(row => row.id === node!.parent_id) : undefined;
    }
    return { id: offering.id, label: `${catalogueDisplayName(subject, locale)} · ${names.join(' › ')}` };
  }).filter((row): row is { id: string; label: string } => !!row);
  const selected = draft.role === 'teacher' ? draft.payload.offerings.offering_ids : [];
  const hiddenSelected = selected.filter(id => !offerings.some(row => row.id === id));
  if (hiddenSelected.length) {
    const savedResult = await db.from('offerings').select('id,owner_teacher_id,node_id,subject_id').in('id', hiddenSelected);
    const savedRows = savedResult.data ?? [];
    const subjectIds = [...new Set(savedRows.map(row => row.subject_id))];
    const nodeIds = [...new Set(savedRows.map(row => row.node_id))];
    const [savedSubjects, savedNodes] = await Promise.all([
      subjectIds.length ? db.from('subjects').select('id,owner_teacher_id,name_ar,name_en').in('id', subjectIds) : Promise.resolve({data:[],error:null}),
      nodeIds.length ? db.from('education_nodes').select('id,owner_teacher_id,name_ar,name_en').in('id', nodeIds) : Promise.resolve({data:[],error:null}),
    ]);
    if (savedResult.error || savedSubjects.error || savedNodes.error) return { db, userId: user.id, role, draft, offerings: [], subjects: choices.subjects, nodes: choices.nodes, hasAvatar, error: true };
    for (const row of savedRows) {
      const subject = savedSubjects.data?.find(item => item.id === row.subject_id);
      const node = savedNodes.data?.find(item => item.id === row.node_id);
      const selectableOwner = (owner: string | null) => owner === null || owner === user.id;
      if (subject && node && selectableOwner(row.owner_teacher_id) && selectableOwner(subject.owner_teacher_id) && selectableOwner(node.owner_teacher_id)) {
        offerings.push({ id: row.id, label: `${catalogueDisplayName(subject, locale)} · ${catalogueDisplayName(node, locale)}${locale === 'ar' ? ' (محفوظ)' : ' (saved)'}` });
      }
    }
  }
  return { db, userId: user.id, role, draft, offerings, subjects: choices.subjects, nodes: choices.nodes, hasAvatar, error: !!choices.error.error || !!avatarResult.error };
}
