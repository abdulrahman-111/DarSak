import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GuidedHelp } from '@/features/assistant/guided-help';
import { HelpDrawer } from '@/features/assistant/help-drawer';
import { buildChatRequestMessages, ChatPanel } from '@/features/assistant/chat-panel';

function markup(element: React.ReactElement) {
  return renderToStaticMarkup(element);
}

describe('guided help UI', () => {
  it('keeps local help available in English and Arabic and adds a Sanad tab', () => {
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

    expect(en).toContain('These local guidance topics run on this device and do not use live AI.');
    expect(en).toContain('What would you like help with?');
    expect(en).toContain('Sanad');
    expect(ar).toContain('هذه إرشادات محلية وقوالب موجّهة. لا تستخدم ذكاءً اصطناعيًا مباشرًا.');
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

  it('shows localized Sanad chat fallback without rendering model HTML or links', () => {
    const en = markup(createElement(ChatPanel, { locale: 'en', available: false, active: true }));
    const ar = markup(createElement(ChatPanel, { locale: 'ar', available: false, active: true }));
    expect(en).toContain('Live help is unavailable right now. You can use local guidance.');
    expect(en).toContain('I&#x27;m Sanad, DarSak&#x27;s assistant.');
    expect(ar).toContain('المساعدة المباشرة غير متاحة الآن');
    expect(en).not.toContain('<a ');
    expect(en).not.toContain('<form');
  });

  it('limits transmitted chat context to API item, count, and total character bounds', () => {
    const history = [
      { role: 'user' as const, text: 'Question' },
      { role: 'assistant' as const, text: 'A'.repeat(6000) },
      ...Array.from({ length: 8 }, (_, index) => ({
        role: 'user' as const,
        text: `Recent ${index}`,
      })),
    ];
    const payload = buildChatRequestMessages(history, 'Next question');
    expect(payload).toHaveLength(8);
    expect(payload.every(message => message.text.length <= 2000)).toBe(true);
    expect(payload.reduce((total, message) => total + message.text.length, 0)).toBeLessThanOrEqual(
      8000,
    );
    expect(payload.at(-1)).toEqual({ role: 'user', text: 'Next question' });
    expect(payload.some(message => message.text === 'A'.repeat(6000))).toBe(false);
  });
});
