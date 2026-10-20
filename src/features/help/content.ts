export type GuidancePage = 'help' | 'privacy' | 'terms';
export function guidanceContent(kind: GuidancePage, locale: string) {
  const ar = locale === 'ar';
  const pages = {
    help: {
      title: ar ? 'كيف نساعدك؟' : 'How can we help?',
      intro: ar
        ? 'إجابات واضحة لبدء التعلم أو تنظيم مجموعاتك على دارسَك.'
        : 'Clear answers to help you start learning or organize your groups on DarSak.',
      sections: ar
        ? [
            [
              'إنشاء حساب والدخول',
              'اختر حساب طالب أو معلم. عند التسجيل بالبريد، أدخل رمز التحقق المرسل إليك. تحقق من مجلد الرسائل غير المرغوب فيها، وانتظر قبل إعادة الإرسال. يمكن استخدام Google أيضًا، ثم إكمال خطوات إعداد الحساب.',
            ],
            [
              'تعذر الدخول؟',
              'استخدم استعادة كلمة المرور إذا كنت قد سجلت بالبريد. إذا سجلت عبر Google، استخدم حساب Google نفسه. لا تشارك كلمة المرور أو رمز التحقق مع أي شخص.',
            ],
            [
              'الانضمام إلى مجموعة',
              'أكمل ملف التعلم، ثم اكتشف المجموعات وراجع المستوى والمواعيد وما تتضمنه المجموعة. إرسال الطلب لا يعني القبول؛ انتظر قرار المعلم في «مجموعاتي وطلباتي». يمكنك إلغاء طلبك أو تسجيلك بعد التأكيد.',
            ],
            [
              'التواصل مع المعلم',
              'الهاتف وواتساب وبريد التواصل متاحة للطلاب النشطين بعد قبول انضمامهم إلى إحدى مجموعات المعلم. الطلب المعلّق وحده لا يتيح هذه البيانات. تجد رابط التواصل في صفحة المجموعة بعد القبول.',
            ],
            [
              'اعتماد المعلمين',
              'يكمل المعلم بيانات خبرته وتخصصاته ومعلومات الطلب. تراجع الإدارة الطلب قبل إتاحة التدريس. المؤهلات المكتوبة في الملف مقدمة من المعلم؛ الاعتماد ليس ضمانًا لنتيجة تعليمية أو توثيقًا مستقلاً لكل مؤهل.',
            ],
            [
              'الإبلاغ عن مشكلة',
              'بعد تسجيل الدخول، افتح «الإبلاغ عن مشكلة» من حسابك. صف المتوقع وما حدث، وأضف الصفحة المتأثرة دون كلمات مرور أو رموز تحقق. يمكنك متابعة الحالة والرد في «بلاغاتي».',
            ],
          ]
        : [
            [
              'Create an account and sign in',
              'Choose a student or teacher account. For email signup, enter the verification code from your inbox. Check spam and wait before resending. You can also use Google, then complete the account setup steps.',
            ],
            [
              'Trouble signing in?',
              'Use password recovery if you registered with email. If you joined with Google, use the same Google account. Never share a password or verification code.',
            ],
            [
              'Join a group',
              'Complete your learning profile, then explore groups and review their level, schedule and included support. A request is not acceptance: follow the teacher’s decision in My classes and requests. You can cancel a request or enrollment after confirming.',
            ],
            [
              'Contact a teacher',
              'Phone, WhatsApp and contact email are available to active students after acceptance into one of that teacher’s groups. A pending request does not unlock them. An accepted student can use the contact link on the group page.',
            ],
            [
              'Teacher approval',
              'Teachers provide their experience, subjects and application information for administrator review before teaching access. Profile qualifications are supplied by the teacher; account approval is not a guaranteed learning result or independent verification of every qualification.',
            ],
            [
              'Report a problem',
              'After signing in, open Report a problem from your account. Describe what you expected and what happened, with the affected page, without passwords or verification codes. Follow the status and response in My reports.',
            ],
          ],
    },
    privacy: {
      title: ar ? 'الخصوصية على دارسَك' : 'Privacy on DarSak',
      intro: ar
        ? 'كيف تُستخدم معلوماتك ومن يمكنه الوصول إليها ضمن المنصة.'
        : 'How your information is used and who can access it within the platform.',
      sections: ar
        ? [
            [
              'معلومات الحساب والتعلم',
              'نستخدم اسمك وبريدك وبيانات الحساب لتسجيل الدخول وتشغيل الحساب. يساعد ملف الطالب، مثل الفئة العمرية والسنة والاهتمامات والأهداف، في تجربة التعلم. لا تنشر هذه البيانات كملف طالب عام.',
            ],
            [
              'ملف المعلم وطلب الاعتماد',
              'الملف المهني والمواد والمجموعات المنشورة مخصصة للاكتشاف. بيانات طلب الاعتماد، مثل هاتف الإدارة ورابط السيرة الذاتية، مخصصة للمعلم والإدارة وفق الصلاحيات. اختر صلاحيات مشاركة مناسبة لرابط Google Drive؛ تتحكم أنت وإعدادات Drive في الوصول إلى الملف الخارجي.',
            ],
            [
              'التسجيل والحصص والتواصل',
              'يستخدم المعلم بيانات الطلاب المسجلين لإدارة الطلبات والحضور والحصص. الوصول إلى المواد يعتمد على التسجيل والصلاحيات. الهاتف وواتساب وبريد التواصل المنفصل للمعلم متاحة بعد قبول الطالب، وليست للزوار.',
            ],
            [
              'البلاغات والتشخيص',
              'يرى صاحب البلاغ والإدارة البلاغ والرد الموجه له. ملاحظات الإدارة الداخلية لا تظهر للمبلّغ. يستخدم مزودا الاستضافة وتسجيل الدخول بيانات التشغيل اللازمة لتقديم الخدمة. لا تضف معلومات حساسة إلى وصف المشكلة.',
            ],
            [
              'إدارة الحساب وحذفه',
              'يمكنك تعديل بياناتك من الحساب وطلب الحذف الدائم من إعداداته. يزيل الحذف الحساب والبيانات المرتبطة التي تديرها المنصة؛ لا يمحو نسخًا سبق تنزيلها أو مراسلات عبر خدمات خارجية. صفحات المساعدة والبلاغات هي مسار الاستفسار عن استخدام الحساب.',
            ],
          ]
        : [
            [
              'Account and learning information',
              'Your name, email and account information support sign-in and account operation. A student learning profile, including age range, education year, interests and goals, supports the learning experience. These fields are not published as a public student profile.',
            ],
            [
              'Teacher profiles and applications',
              'Professional profiles, subjects and published groups support discovery. Application information, such as the administrator contact phone and CV link, is restricted to the teacher and administration under existing permissions. Choose appropriate Google Drive sharing settings: access to the external file is also controlled by you and Drive.',
            ],
            [
              'Enrollment, lessons and contact details',
              'Teachers use enrolled student information to manage requests, attendance and lessons. Material access depends on enrollment and permissions. A teacher’s phone, WhatsApp and separate contact email become available after student acceptance, and are hidden from visitors.',
            ],
            [
              'Reports and diagnostics',
              'Reporters and administrators can see a report and its public response. Internal administrator notes are hidden from the reporter. Hosting and sign-in providers process operational information needed to deliver the service. Do not include sensitive information in problem descriptions.',
            ],
            [
              'Manage or delete your account',
              'You can edit your details under Account and request permanent account deletion in its settings. Deletion removes the account and associated platform-managed records; it cannot erase downloaded copies or conversations through external services. Use Help and the reporting workflow for account-use questions.',
            ],
          ],
    },
    terms: {
      title: ar ? 'استخدام دارسَك' : 'Using DarSak',
      intro: ar
        ? 'إرشادات واضحة للتعلم والتواصل باحترام.'
        : 'Clear expectations for learning and respectful communication.',
      sections: ar
        ? [
            [
              'دور المنصة',
              'تساعد دارسَك الطلاب على اكتشاف المعلمين والمجموعات، وتساعد المعلمين على تنظيم الجداول والطلبات والمواد. المعلم مسؤول عن دقة معلومات المجموعة والمحتوى الذي يقدمه.',
            ],
            [
              'الحساب والمعلومات الصحيحة',
              'قدم معلومات دقيقة ومناسبة للدور الذي تختاره. لا تنتحل شخصية أو تدعي مؤهلاً غير صحيح. حافظ على سرية بيانات الدخول ولا تستخدم حسابًا آخر دون إذنه.',
            ],
            [
              'التسجيل والتغييرات',
              'راجع تفاصيل المجموعة والمواعيد وأي رسوم معلنة قبل إرسال الطلب. القبول يقرره المعلم. تابع تحديثات المجموعة عند تغيير موعد أو إلغاء حصة. اسأل المعلم عن الترتيبات غير الموضحة بعد إتاحة التواصل.',
            ],
            [
              'السلامة والمحتوى',
              'تواصل باحترام ولا تنشر بيانات الآخرين أو محتوى مسيئًا أو مواد لا تملك حق مشاركتها. أبلغ الإدارة عن المشاكل أو المحتوى المخالف. يمكن للإدارة تقييد الحسابات أو المحتوى وفق أدوات الإشراف المتاحة.',
            ],
            [
              'توقعات واقعية',
              'النتائج تعتمد على الاحتياجات والجهد وطريقة التدريس، ولا تعد المنصة بدرجات أو قبول دراسي مضمون. تُقدّم تفاصيل المعلم من صاحبها، وتساعد المراجعة الإدارية على تنظيم الوصول للمنصة.',
            ],
          ]
        : [
            [
              'The platform’s role',
              'DarSak helps students discover teachers and learning groups, and helps teachers organize schedules, requests and materials. Teachers are responsible for the accuracy of their group information and the content they provide.',
            ],
            [
              'Accounts and accurate information',
              'Provide accurate information appropriate to your chosen role. Do not impersonate others or misrepresent qualifications. Keep sign-in details private and do not use someone else’s account without permission.',
            ],
            [
              'Enrollment and changes',
              'Review group details, schedules and any stated fees before requesting enrollment. The teacher decides acceptance. Follow group updates when a lesson is rescheduled or cancelled. Ask the teacher about arrangements not stated once contact access is available.',
            ],
            [
              'Safety and content',
              'Communicate respectfully. Do not publish other people’s personal information, abusive content or materials you are not entitled to share. Report problems or inappropriate content. Administrators can restrict accounts or content using the available moderation tools.',
            ],
            [
              'Realistic expectations',
              'Learning results depend on individual needs, effort and teaching approach. The platform does not promise grades or educational admission. Teacher information is provided by its author; administrative review helps manage access to the platform.',
            ],
          ],
    },
  };
  return pages[kind];
}
