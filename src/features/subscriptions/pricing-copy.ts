export function pricingCopy(locale: string) {
  if (locale === 'ar') return {
    eyebrow: 'خطط المعلمين القادمة', title: 'مساحة منظمة لتدريس أفضل', intro: 'ستظل جميع الأدوات التعليمية متاحة للمعلمين. تختلف الخطط في حدود المجموعات والملفات المخزنة فقط، والطلاب لا يدفعون مقابل استخدام المنصة.',
    free: 'الإطلاق المجاني مستمر حتى نهاية ١٤ نوفمبر ٢٠٢٦ بتوقيت القاهرة.', start: 'أقرب موعد لبدء الخطط المدفوعة هو ١٥ نوفمبر ٢٠٢٦. الخطط والأسعار معلنة مسبقاً، لكنها غير مفعلة حالياً ولن يتم تحصيل أي مبلغ الآن.',
    standard: 'ستاندرد', pro: 'برو', month: 'شهرياً', groups: 'مجموعات نشطة', files: 'ملفات دروس مخزنة', storage: 'إجمالي مساحة ملفات الدروس', perFile: 'الحد الأقصى للملف الواحد', availability: 'خطة قادمة · غير متاحة حالياً', common: 'الأدوات التعليمية الأساسية نفسها في الخطتين. الطلاب يستخدمون المنصة مجاناً، ويتفقون على رسوم الدروس مباشرة مع المعلم.',
    quota: 'حدود الملفات تخص العدد والمساحة المخزنة حالياً؛ لا تتجدد شهرياً. تبقى الملفات ضمن الحدود حتى حذفها. الروابط والملاحظات الخارجية لا تحتسب ضمن الحد، والمجموعات المؤرشفة لا تحتسب ضمن حد المجموعات النشطة.',
    paymentTitle: 'هل أنت مستعد لتنظيم عملك التعليمي؟', payment: 'أنشئ ملفك كمعلم، وانشر مجموعاتك وأدر دروسك وموادك التعليمية من مكان واحد.',
    cta: 'ابدأ التسجيل المجاني للمعلمين', ctaTeacher: 'إدارة الوصول التعليمي', ctaStudent: 'اكتشف المعلمين', ctaAdmin: 'لوحة الإدارة', ctaAccount: 'حسابي',
  };
  return {
    eyebrow: 'Upcoming teacher plans', title: 'A more organized way to teach', intro: 'Teachers keep the same core teaching tools on either plan. Plans differ only in group and stored file limits, and students use the platform for free.',
    free: 'The free launch continues through 14 November 2026, Cairo time.', start: 'The earliest paid-plan start date is 15 November 2026. Plans and prices are published in advance, but they are not active now and no payment will be collected now.',
    standard: 'Standard', pro: 'Pro', month: 'month', groups: 'Active groups', files: 'Stored lesson files', storage: 'Total lesson-file storage', perFile: 'Maximum per file', availability: 'Upcoming plan · not available yet', common: 'Both plans include the same core teaching tools. Students use the platform for free and agree lesson fees directly with their teacher.',
    quota: 'File limits apply to files retained at a time; they do not reset monthly. Files count until deleted. External links and notes do not count toward file limits. Archived groups do not count toward the active group limit.',
    paymentTitle: 'Ready to organize your teaching?', payment: 'Create your teacher profile, publish groups, and manage lessons and teaching materials in one place.',
    cta: 'Start free teacher registration', ctaTeacher: 'Manage teaching access', ctaStudent: 'Discover teachers', ctaAdmin: 'Admin dashboard', ctaAccount: 'My account',
  };
}
