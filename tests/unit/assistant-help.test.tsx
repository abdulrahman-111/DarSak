import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GuidedHelp } from '@/features/assistant/guided-help';
import { HelpDrawer } from '@/features/assistant/help-drawer';

function markup(element: React.ReactElement) {
  return renderToStaticMarkup(element);
}

describe('guided help UI', () => {
  it('renders English and Arabic local help with an explicit live AI status', () => {
    const en = markup(
      createElement(GuidedHelp, {
        locale: 'en',
        access: { role: 'student', canTeach: false },
      }),
    );
    const ar = markup(
      createElement(GuidedHelp, {
        locale: 'ar',
        access: { role: 'student', canTeach: false },
      }),
    );

    expect(en).toContain('Guided platform help runs locally. Live AI answers are unavailable.');
    expect(en).toContain('What would you like help with?');
    expect(ar).toContain('هذه مساعدة محلية موجّهة. الإجابات لا تستخدم ذكاءً اصطناعيًا مباشرًا.');
    expect(ar).toContain('ما الذي تريد المساعدة فيه؟');
  });

  it('accepts all server-derived roles and does not render identity data', () => {
    const student = markup(
      createElement(GuidedHelp, {
        locale: 'en',
        access: { role: 'student', canTeach: false },
      }),
    );
    const teacherWithoutAccess = markup(
      createElement(GuidedHelp, {
        locale: 'en',
        access: { role: 'teacher', canTeach: false },
      }),
    );
    const teacherWithAccess = markup(
      createElement(GuidedHelp, {
        locale: 'en',
        access: { role: 'teacher', canTeach: true },
      }),
    );
    const admin = markup(
      createElement(GuidedHelp, {
        locale: 'en',
        access: { role: 'admin', canTeach: false },
      }),
    );

    expect(student).toContain('Requests and classes');
    expect(student).not.toContain('/en/teacher/groups/new');
    expect(teacherWithoutAccess).toContain('Teaching access');
    expect(teacherWithoutAccess).not.toContain('/en/teacher/groups/new');
    expect(teacherWithAccess).toContain('Create and manage groups');
    expect(admin).toContain('Teacher review');
    expect(admin).not.toContain('/en/teacher/groups/new');
    for (const html of [student, teacherWithoutAccess, teacherWithAccess, admin]) {
      expect(html).not.toContain('full_name');
      expect(html).not.toContain('email');
    }
  });

  it('provides a compact help trigger and native dialog for every workspace shell', () => {
    const html = markup(
      createElement(HelpDrawer, {
        locale: 'ar',
        access: { role: 'admin', canTeach: false },
      }),
    );
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('<dialog');
    expect(html).toContain('المساعدة');
    expect(html).toContain('إغلاق المساعدة');
    expect(html).toContain('المساعدة الموجّهة');
  });
});
