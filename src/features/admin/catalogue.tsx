import { Card } from '@/components/ui';
import { AdminForm, type Field } from './forms';
import { words } from './labels';
import { nodeKinds, type Node } from './domain';
type Subject = { id: string; name_ar: string; name_en: string; slug: string };
type Offering = { id: string; node_id: string; subject_id: string };
export function CatalogueEditor({
  locale,
  nodes,
  subjects,
  offerings,
}: {
  locale: string;
  nodes: Node[];
  subjects: Subject[];
  offerings: Offering[];
}) {
  const t = words(locale);
  const name = (v: { name_ar: string; name_en: string }) =>
    locale === 'ar' ? v.name_ar : v.name_en;
  const names = (row?: Subject): Field[] => [
    { name: 'name_ar', label: t.nameAr, value: row?.name_ar, required: true },
    { name: 'name_en', label: t.nameEn, value: row?.name_en, required: true },
    { name: 'slug', label: t.slug, value: row?.slug, required: true, maxLength: 100 },
  ];
  const nodeFields = (row?: Node): Field[] => [
    ...names(row),
    {
      name: 'kind',
      label: t.kind,
      value: row?.kind || 'system',
      options: nodeKinds.map(k => ({ value: k, label: t[k] })),
    },
    {
      name: 'parent_id',
      label: t.parent,
      value: row?.parent_id || '',
      options: [
        { value: '', label: t.none },
        ...nodes
          .filter(n => n.id !== row?.id)
          .map(n => ({
            value: n.id,
            label: `${name(n)} · ${t[n.kind as (typeof nodeKinds)[number]]}`,
          })),
      ],
    },
  ];
  const offeringFields = (row?: Offering): Field[] => [
    {
      name: 'node_id',
      label: t.context,
      value: row?.node_id,
      required: true,
      options: [
        { value: '', label: '—' },
        ...nodes
          .filter(n => ['grade', 'university', 'year'].includes(n.kind))
          .map(n => ({ value: n.id, label: name(n) })),
      ],
    },
    {
      name: 'subject_id',
      label: t.subject,
      value: row?.subject_id,
      required: true,
      options: [{ value: '', label: '—' }, ...subjects.map(s => ({ value: s.id, label: name(s) }))],
    },
  ];
  const sections = [
    {
      key: 'node',
      title: t.nodes,
      rows: nodes,
      fields: nodeFields as (r?: never) => Field[],
      titleFor: (r: Node) => name(r),
    },
    {
      key: 'subject',
      title: t.subjects,
      rows: subjects,
      fields: names as (r?: never) => Field[],
      titleFor: (r: Subject) => name(r),
    },
    {
      key: 'offering',
      title: t.offerings,
      rows: offerings,
      fields: offeringFields as (r?: never) => Field[],
      titleFor: (r: Offering) =>
        `${name(subjects.find(s => s.id === r.subject_id) || { name_ar: '—', name_en: '—' })} · ${name(nodes.find(n => n.id === r.node_id) || { name_ar: '—', name_en: '—' })}`,
    },
  ];
  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-muted">{t.hierarchy}</p>
      {sections.map(section => (
        <section key={section.key}>
          <h2 className="mb-4 text-2xl font-bold text-teal">
            {section.title} <span className="text-base text-muted">({section.rows.length})</span>
          </h2>
          <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
            <Card>
              <h3 className="mb-4 font-bold">{t.create}</h3>
              <AdminForm
                locale={locale}
                operation={section.key}
                fields={section.fields()}
                button={t.create}
              />
            </Card>
            <div className="space-y-3">
              {section.rows.length === 0 && <Card>{t.empty}</Card>}
              {section.rows.map(row => (
                <Card key={row.id}>
                  <details>
                    <summary className="cursor-pointer font-bold text-teal">
                      {section.titleFor(row as never)}
                    </summary>
                    <div className="mt-5">
                      <AdminForm
                        locale={locale}
                        operation={section.key}
                        id={row.id}
                        fields={section.fields(row as never)}
                      />
                      <details className="mt-5 border-t border-line pt-4">
                        <summary className="cursor-pointer text-sm text-red-700">
                          {t.remove}
                        </summary>
                        <p className="my-3 text-sm text-muted">{t.deleteHelp}</p>
                        <AdminForm
                          locale={locale}
                          operation={`delete-${section.key}`}
                          id={row.id}
                          fields={[{ name: 'confirm', label: t.confirmDelete, type: 'checkbox' }]}
                          button={t.remove}
                        />
                      </details>
                    </div>
                  </details>
                </Card>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
