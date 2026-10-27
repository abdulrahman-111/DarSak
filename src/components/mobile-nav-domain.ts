export type MobileWorkspaceRole = 'student' | 'teacher';
export type MobileWorkspaceLink = { href: string; label: string };
export type MobilePrimaryIcon =
  'home' | 'groups' | 'calendar' | 'requests' | 'explore' | 'teachers' | 'reports' | 'people';
export type MobilePrimaryLink = MobileWorkspaceLink & {
  key: string;
  icon: MobilePrimaryIcon;
  activePaths?: string[];
};

const labels = {
  en: { more: 'More' },
  ar: { more: 'المزيد' },
};

export function mobileWorkspaceNavigation(
  locale: string,
  _role: MobileWorkspaceRole,
  items: Array<
    MobileWorkspaceLink & { primary?: { key: string; icon: string }; activePaths?: string[] }
  >,
) {
  const copy = labels[locale === 'ar' ? 'ar' : 'en'];
  const primary = items.flatMap(item =>
    item.primary
      ? [
          {
            ...item,
            key: item.primary.key,
            icon: item.primary.icon as MobilePrimaryIcon,
          } as MobilePrimaryLink,
        ]
      : [],
  );
  const primaryHrefs = new Set(primary.map(item => item.href));
  return {
    primary,
    secondary: items.filter(item => !primaryHrefs.has(item.href)),
    moreLabel: copy.more,
  };
}
