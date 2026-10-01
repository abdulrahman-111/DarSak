import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { CatalogueEditor } from '@/features/admin/catalogue';
import { ScreenTitle } from '@/components/platform/ui';
import type { Node } from '@/features/admin/domain';

export default async function AdminEducation({params}:{params:Promise<{locale:string}>}){const {locale:raw}=await params;const locale=ensureLocale(raw),ar=locale==='ar';const me=await requireViewer(locale,'admin');const [nodes,subjects,offerings]=await Promise.all([me.db.from('education_nodes').select('*').order('name_en'),me.db.from('subjects').select('*').order('name_en'),me.db.from('offerings').select('*').order('created_at')]);return <><ScreenTitle eyebrow={ar?'هيكل الدراسة':'Academic structure'} title={ar?'الدليل التعليمي':'Education catalogue'} description={ar?'أدر الأنظمة والمراحل والمواد والسياقات التي ينشئ المعلمون مجموعاتهم ضمنها.':'Manage the systems, levels, subjects, and contexts used by teaching groups.'}/><CatalogueEditor locale={locale} nodes={(nodes.data||[]) as Node[]} subjects={subjects.data||[]} offerings={offerings.data||[]}/></>}
