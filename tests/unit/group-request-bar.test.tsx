import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/features/student/actions', () => ({
  enrollmentAction: vi.fn(),
  downloadMaterial: vi.fn(),
}));
vi.mock('@/features/student/class-workspace-actions', () => ({ leaveStudentClass: vi.fn() }));

import { EnrollmentForm } from '@/features/student/forms';
import { focusRequestAction, REQUEST_ACTION_SELECTOR } from '@/features/groups/request-bar';

describe('group request bar focus target', () => {
  it('focuses the marked enrollment action, not the first control in the panel', () => {
    const save = { focus: vi.fn() };
    const request = { focus: vi.fn() };
    const panel = {
      // The panel's first control is Save/Unsave; only the marked request action should be chosen.
      querySelector: vi.fn((selector: string) =>
        selector === REQUEST_ACTION_SELECTOR ? request : save,
      ),
    };

    const focused = focusRequestAction(panel as unknown as ParentNode);

    expect(panel.querySelector).toHaveBeenCalledWith(REQUEST_ACTION_SELECTOR);
    expect(focused).toBe(request);
    expect(request.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(save.focus).not.toHaveBeenCalled();
  });

  it('does nothing when the panel has no enrollment action', () => {
    expect(focusRequestAction({ querySelector: () => null } as unknown as ParentNode)).toBeNull();
  });

  it('marks only the request variant of the enrollment form as the request action', () => {
    const request = renderToStaticMarkup(
      createElement(EnrollmentForm, { locale: 'en', id: 'group-1', kind: 'request' }),
    );
    const cancel = renderToStaticMarkup(
      createElement(EnrollmentForm, { locale: 'en', id: 'enrollment-1', kind: 'cancel' }),
    );

    expect(request).toContain('data-request-action');
    expect(cancel).not.toContain('data-request-action');
  });
});
