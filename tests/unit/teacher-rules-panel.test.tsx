import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {TeacherRulesPanel} from '@/features/teacher/teacher-rules-panel';
import {TEACHER_RULES_VERSION,TEACHER_RULES_TEXT} from '@/features/teacher/teacher-rules';

describe('teacher rules consent presentation',()=>{
  for(const locale of ['en','ar'] as const) it(`shows the complete ${locale} rules with a separate unchecked acceptance`,()=>{
    const html=renderToStaticMarkup(<TeacherRulesPanel locale={locale} showAcceptance/>);
    expect(html).toContain('name="teacher_rules"');
    expect(html).not.toContain('checked=""');
    for(const rule of TEACHER_RULES_TEXT[locale].rules) expect(html).toContain(rule);
    expect(html).toContain(TEACHER_RULES_TEXT[locale].acceptance);
    expect(TEACHER_RULES_VERSION).toBe('2026-10-18');
  });
  it('displays rules at signup without implying consent was already given',()=>{
    const html=renderToStaticMarkup(<TeacherRulesPanel locale="en"/>);
    expect(html).toContain('before submitting your teacher application');
    expect(html).not.toContain('type="checkbox"');
  });
});
