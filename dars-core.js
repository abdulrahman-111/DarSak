window.DarsCore = (function () {
  const DG = '٠١٢٣٤٥٦٧٨٩';
  const DAYS = [['Sunday', 'الأحد'], ['Monday', 'الاثنين'], ['Tuesday', 'الثلاثاء'], ['Wednesday', 'الأربعاء'], ['Thursday', 'الخميس'], ['Friday', 'الجمعة'], ['Saturday', 'السبت']];
  const PATHS = [['All', 'الكل'], ['National', 'ثانوية عامة'], ['IG/British', 'IG/بريطاني'], ['University', 'جامعي']];
  const G = [
    { id: 'g1', owner: 1, subj: ['Mathematics', 'رياضيات'], name: ['Secondary 3 Mathematics — Evening', 'رياضيات ٣ ثانوي — مجموعة المساء'], t: ['Mona Adel', 'منى عادل'], path: 'National', cr: [['National', 'Secondary', 'Secondary 3', 'Mathematics'], ['ثانوية عامة', 'المرحلة الثانوية', 'الصف الثالث', 'الرياضيات']], slots: [[0, 18, 20], [3, 18, 20]], loc: ['Nasr City, Cairo', 'مدينة نصر، القاهرة'], cap: 30, taken: 28, c: 0, d: ['Full-syllabus revision for Secondary 3 with weekly problem sets and past-paper practice.', 'مراجعة شاملة لمنهج الصف الثالث الثانوي مع تمارين أسبوعية وحل امتحانات سابقة.'] },
    { id: 'g2', subj: ['Physics', 'فيزياء'], name: ['IGCSE Physics — Year 10', 'فيزياء IGCSE — السنة العاشرة'], t: ['Karim Samir', 'كريم سمير'], path: 'IG/British', cr: [['IG/British', 'IGCSE', 'Year 10', 'Physics'], ['IG/بريطاني', 'IGCSE', 'السنة العاشرة', 'الفيزياء']], slots: [[1, 17, 18.5], [4, 17, 18.5]], loc: ['Online', 'أونلاين'], cap: 15, taken: 15, c: 1, d: ['A small group covering the Cambridge IGCSE syllabus with short practical demonstrations.', 'مجموعة صغيرة تغطي منهج Cambridge IGCSE مع تجارب عملية قصيرة.'] },
    { id: 'g3', subj: ['Control Systems', 'نظم التحكم'], name: ['Control Systems — Year 3', 'نظم التحكم — الفرقة الثالثة'], t: ['Dr. Hany Fawzy', 'د. هاني فوزي'], path: 'University', cr: [['Assiut University', 'Engineering', 'Electrical Engineering', 'Year 3', 'Control Systems'], ['جامعة أسيوط', 'الهندسة', 'الهندسة الكهربية', 'الفرقة الثالثة', 'نظم التحكم']], slots: [[2, 19, 21]], loc: ['Assiut', 'أسيوط'], cap: 40, taken: 12, c: 2, d: ['Weekly walkthrough of the Control Systems course with solved sheet problems.', 'شرح أسبوعي لمقرر نظم التحكم مع حل مسائل الشيتات.'] },
    { id: 'g4', subj: ['Chemistry', 'كيمياء'], name: ['Secondary 2 Chemistry', 'كيمياء ٢ ثانوي'], t: ['Salma Nabil', 'سلمى نبيل'], path: 'National', cr: [['National', 'Secondary', 'Secondary 2', 'Chemistry'], ['ثانوية عامة', 'المرحلة الثانوية', 'الصف الثاني', 'الكيمياء']], slots: [[0, 16, 17.5], [4, 16, 17.5]], loc: ['Heliopolis, Cairo', 'مصر الجديدة، القاهرة'], cap: 25, taken: 9, c: 3, d: ['Chemistry for Secondary 2, one chapter at a time, with a short quiz each week.', 'كيمياء الصف الثاني الثانوي فصلًا بفصل، مع اختبار قصير كل أسبوع.'] },
    { id: 'g5', subj: ['Calculus I', 'تفاضل وتكامل ١'], name: ['Calculus I — General course', 'تفاضل وتكامل ١ — مقرر جامعي عام'], t: ['Omar Tarek', 'عمر طارق'], path: 'University', cr: [['General university course', 'Calculus I'], ['مقرر جامعي عام', 'تفاضل وتكامل ١']], slots: [[5, 11, 13]], loc: ['Online', 'أونلاين'], cap: 60, taken: 41, c: 4, d: ['Calculus I for first-year students from any university: limits, derivatives and integrals.', 'تفاضل وتكامل ١ لطلاب السنة الأولى من أي جامعة: النهايات والاشتقاق والتكامل.'] },
    { id: 'g6', subj: ['English Literature', 'الأدب الإنجليزي'], name: ['A-Level English Literature', 'الأدب الإنجليزي — A-Level'], t: ['Nour El-Din Hassan', 'نور الدين حسن'], path: 'IG/British', cr: [['IG/British', 'A-Level', 'Year 12', 'English Literature'], ['IG/بريطاني', 'A-Level', 'السنة ١٢', 'الأدب الإنجليزي']], slots: [[1, 19, 20.5], [3, 19.5, 21]], loc: ['Zamalek, Cairo', 'الزمالك، القاهرة'], cap: 12, taken: 7, c: 5, d: ['Close reading of the set texts and timed essay practice for A-Level.', 'قراءة متأنية للنصوص المقررة وتدريب على كتابة المقال في وقت محدد.'] },
    { id: 'g7', owner: 1, subj: ['Mathematics', 'رياضيات'], name: ['Secondary 1 Mathematics', 'رياضيات ١ ثانوي'], t: ['Mona Adel', 'منى عادل'], path: 'National', cr: [['National', 'Secondary', 'Secondary 1', 'Mathematics'], ['ثانوية عامة', 'المرحلة الثانوية', 'الصف الأول', 'الرياضيات']], slots: [[6, 15, 16.5], [2, 18, 19.5]], loc: ['Nasr City, Cairo', 'مدينة نصر، القاهرة'], cap: 20, taken: 20, c: 0, d: ['Foundations for Secondary 1: algebra, geometry and weekly practice.', 'أساسيات الصف الأول الثانوي: الجبر والهندسة وتدريب أسبوعي.'] }
  ];
  const EX = { 'g4-4': 'rescheduled', 'g1-3': 'cancelled' };
  const TREE = {
    National: { lab: ['Level', 'Grade', 'Subject'], labAr: ['المرحلة', 'الصف', 'المادة'], l: [['Preparatory', 'الإعدادية'], ['Secondary', 'الثانوية']], g: { Preparatory: [['Prep 3', 'الثالث الإعدادي']], Secondary: [['Secondary 1', 'الأول الثانوي'], ['Secondary 2', 'الثاني الثانوي'], ['Secondary 3', 'الثالث الثانوي']] }, s: [['Mathematics', 'الرياضيات'], ['Physics', 'الفيزياء'], ['Chemistry', 'الكيمياء'], ['Arabic', 'اللغة العربية']] },
    'IG/British': { lab: ['Level', 'Year', 'Subject'], labAr: ['المستوى', 'السنة', 'المادة'], l: [['IGCSE', 'IGCSE'], ['A-Level', 'A-Level']], g: { IGCSE: [['Year 10', 'السنة ١٠'], ['Year 11', 'السنة ١١']], 'A-Level': [['Year 12', 'السنة ١٢'], ['Year 13', 'السنة ١٣']] }, s: [['Mathematics', 'الرياضيات'], ['Physics', 'الفيزياء'], ['English Literature', 'الأدب الإنجليزي']] },
    University: { lab: ['University & faculty', 'Program & year', 'Course'], labAr: ['الجامعة والكلية', 'القسم والسنة', 'المقرر'], l: [['Assiut University · Engineering', 'جامعة أسيوط · الهندسة'], ['General university course', 'مقرر جامعي عام']], g: { 'Assiut University · Engineering': [['Electrical · Year 3', 'الكهربية · الفرقة الثالثة'], ['Civil · Year 2', 'المدنية · الفرقة الثانية']], 'General university course': [['Any university', 'أي جامعة']] }, s: [['Control Systems', 'نظم التحكم'], ['Calculus I', 'تفاضل وتكامل ١'], ['Programming Fundamentals', 'أساسيات البرمجة']] }
  };
  const SYS = [['National', 'ثانوية عامة'], ['IG/British', 'IG/بريطاني'], ['University', 'جامعي']];
  const MAT0 = [
    { id: 'm1', type: 'pdf', title: ['Integration by parts — worksheet', 'التكامل بالتجزئة — ورقة تمارين'], meta: ['PDF · 1.2 MB · Sep 21', 'PDF · ١٫٢ ميجابايت · ٢١ سبتمبر'] },
    { id: 'm2', type: 'link', title: ['Area under a curve (interactive graph)', 'المساحة تحت المنحنى (رسم تفاعلي)'], meta: ['Link · desmos.com', 'رابط · desmos.com'] },
    { id: 'm3', type: 'note', title: ["Bring last week's homework and a scientific calculator.", 'أحضروا واجب الأسبوع الماضي وآلة حاسبة علمية.'], meta: ['Note', 'ملاحظة'] }
  ];
  const QUEUE0 = [
    { id: 'a1', n: ['Hossam Farouk', 'حسام فاروق'], h: ['Physics teacher for IGCSE and A-Level', 'مدرس فيزياء لطلاب IGCSE وA-Level'], b: ['Eleven years teaching Cambridge Physics in Cairo and Alexandria. Former head of science at a British-curriculum school.', 'أحد عشر عامًا في تدريس فيزياء كامبريدج في القاهرة والإسكندرية، ورئيس سابق لقسم العلوم في مدرسة بريطانية.'], sp: [['IG/British › IGCSE › Physics', 'IG/بريطاني ‹ IGCSE ‹ الفيزياء'], ['IG/British › A-Level › Physics', 'IG/بريطاني ‹ A-Level ‹ الفيزياء']], d: ['Sep 22', '٢٢ سبتمبر'] },
    { id: 'a2', n: ['Rana Youssef', 'رنا يوسف'], h: ['Arabic language, Secondary stage', 'اللغة العربية للمرحلة الثانوية'], b: ['Teaches grammar, rhetoric and literature for Secondary 1–3 with a focus on exam writing.', 'تدرّس النحو والبلاغة والأدب لطلاب الصفوف الثانوية مع تركيز على التعبير في الامتحان.'], sp: [['National › Secondary › Arabic', 'ثانوية عامة ‹ الثانوية ‹ اللغة العربية']], d: ['Sep 23', '٢٣ سبتمبر'] },
    { id: 'a3', n: ['Dr. Tamer Aziz', 'د. تامر عزيز'], h: ['Engineering mathematics, university level', 'رياضيات هندسية للمرحلة الجامعية'], b: ['Lecturer in engineering mathematics. Offers Calculus I and differential equations for first- and second-year students.', 'محاضر رياضيات هندسية، يقدم تفاضل وتكامل ١ والمعادلات التفاضلية لطلاب السنتين الأولى والثانية.'], sp: [['General university course › Calculus I', 'مقرر جامعي عام ‹ تفاضل وتكامل ١'], ['Assiut University › Engineering › Year 2', 'جامعة أسيوط ‹ الهندسة ‹ الفرقة الثانية']], d: ['Sep 24', '٢٤ سبتمبر'] }
  ];
  const TREQ0 = [
    { id: 'r1', n: ['Ahmed Hassan', 'أحمد حسن'], g: 'g1', d: ['Sep 21', '٢١ سبتمبر'] },
    { id: 'r2', n: ['Laila Mostafa', 'ليلى مصطفى'], g: 'g1', d: ['Sep 22', '٢٢ سبتمبر'] },
    { id: 'r3', n: ['Omar Khaled', 'عمر خالد'], g: 'g7', d: ['Sep 23', '٢٣ سبتمبر'] }
  ];
  const NOTES0 = [
    { id: 'n1', x: ['Salma Nabil added "Chapter 3 summary" to Secondary 2 Chemistry.', 'أضافت سلمى نبيل "ملخص الفصل الثالث" إلى كيمياء ٢ ثانوي.'], w: ['2 h ago', 'منذ ساعتين'], u: true },
    { id: 'n2', x: ["Thursday's Chemistry lesson moved to 5:00–6:30 PM.", 'تغيّر موعد حصة الكيمياء يوم الخميس إلى ٥:٠٠–٦:٣٠ م.'], w: ['Yesterday', 'أمس'], u: true },
    { id: 'n3', x: ['Your request for Calculus I — General course was not accepted.', 'لم يُقبل طلبك في تفاضل وتكامل ١ — مقرر جامعي عام.'], w: ['Mon', 'الاثنين'], u: false }
  ];
  const SMAT = [
    { title: ['Chapter 3 summary', 'ملخص الفصل الثالث'], meta: ['PDF · 860 KB · Secondary 2 Chemistry', 'PDF · ٨٦٠ كيلوبايت · كيمياء ٢ ثانوي'], k: ['PDF', 'PDF'] },
    { title: ['Lab safety sheet', 'إرشادات الأمان في المعمل'], meta: ['Image · 1.1 MB · Secondary 2 Chemistry', 'صورة · ١٫١ ميجابايت · كيمياء ٢ ثانوي'], k: ['IMG', 'صورة'] },
    { title: ['Periodic table practice', 'تدريب على الجدول الدوري'], meta: ['Link · ptable.com', 'رابط · ptable.com'], k: ['URL', 'رابط'] }
  ];
  const T = {
    en: {
      brand: 'Dars', brandAlt: 'درس', langBtn: 'العربية', viewAs: 'View as', student: 'Student', teacher: 'Teacher', admin: 'Admin', guest: 'Guest',
      n_home: 'Home', n_discover: 'Discover', n_signup: 'Create account', n_sdash: 'Home', n_stime: 'Timetable', n_tdash: 'Overview', n_treq: 'Requests', n_tcreate: 'New group', n_lesson: 'Lessons', n_admin: 'Admin', signin: 'Sign in', more: 'More', screens: 'All screens', jump: 'Jump to a screen', jumpPh: 'Type a screen or role',
      eyebrow: 'Private tutoring, organised · Egypt', heroA: 'Your teachers, groups and week in one timetable.', heroB: 'Every group. Every lesson. One week you can read.', heroC: 'Find your group. Your week organises itself.',
      heroSub: 'Find a group that fits your education path and request to join. Once the teacher accepts, every lesson and its materials appear in your timetable.',
      ctaFind: 'Find a class', ctaTeacher: 'I am a teacher', forPaths: 'For', how: 'How it works', howTitle: 'From search to schedule in three steps',
      s1t: 'Find a group', s1d: 'Filter by education system, level and subject, then compare schedules and seats.', s2t: 'Request to join', s2d: 'The teacher reviews your request. You can follow its status at any time.', s3t: "It's in your week", s3d: 'Accepted groups appear in your timetable with every lesson and its materials.',
      tchEyebrow: 'For teachers', tchTitle: 'Run every group from one place, not ten chats.', tchCta: 'Create a teacher account',
      f1t: 'Recurring schedules', f1d: 'Weekly slots with conflict checks across all your groups.', f2t: 'Enrollment review', f2d: 'Accept or reject requests with capacity always in view.', f3t: 'Lessons and materials', f3d: 'Attach PDFs, images, links and notes to each dated lesson.', f4t: 'Private by default', f4d: 'Only accepted students can open your lesson materials.',
      privacy: 'Lesson details and materials are private to accepted students.', footer: 'Times shown in Cairo time', help: 'Help', report: 'Report a problem', thisWeek: 'This week', accepted_demo: 'Request accepted', accepted_demo_d: 'Secondary 3 Mathematics was added to your timetable.',
      dEyebrow: 'Discover groups', dTitle: 'Groups open for enrollment', search: 'Search', searchPh: 'Subject, course or teacher', noRes: 'No groups match these filters', noResD: 'Try a different subject, or clear the filters to see every published group.', clear: 'Clear filters', subjects: 'Subject', pathQ: 'Which education path?', subjQ: 'Which subject?', anySubj: 'Any subject', results: 'Results',
      weekly: 'Weekly', where: 'Where', seats: 'Seats', location: 'Location', details: 'View details', close: 'Close', schedCairo: 'Weekly schedule · Cairo time', profile: 'View teacher profile',
      headsUp: 'Heads up.', canStill: 'You can still request to join.', reqJoin: 'Request to join', signinReq: 'Sign in to request enrollment', pendT: 'Request pending.', pendD: "Your request was sent to the teacher. You'll be notified when they decide.", cancelReq: 'Cancel request', accT: "You're in this group.", accD: 'Its lessons are in your timetable.', openTT: 'Open my timetable', fullD: 'This group is full. You cannot request enrollment right now.', rejT: 'Your previous request was not accepted.', rejD: 'You can send a new request if your situation has changed.', reqAgain: 'Send a new request',
      st_pending: 'Pending', st_accepted: 'Accepted', st_rejected: 'Rejected', st_full: 'Full', st_cancelled: 'Cancelled', st_completed: 'Completed', st_scheduled: 'Scheduled', st_rescheduled: 'Rescheduled', st_draft: 'Draft', st_published: 'Published',
      today: 'Today', noToday: 'No lessons today.', nextUp: 'Coming up', myReqs: 'Enrollment requests', myClasses: 'My classes', recentMat: 'Recent materials', updates: 'Updates', findAnother: 'Find another group', open: 'Open', nextLesson: 'Next', requested: 'Requested', unread: 'unread', viewAll: 'View all',
      ttEyebrow: 'My timetable', ttTitle: 'Your week, Sunday first', cairo: 'Cairo time', week: 'Week', agenda: 'Agenda', conflictT: 'Time conflict', overlaps: 'Overlaps', noLessons: 'No lessons', legend: 'Groups',
      tPrimary: 'Review requests', tToday: "Today's lessons", tPendingT: 'Pending requests', tGroups: 'My groups', tWarn: 'Needs attention', sActive: 'Active groups', sStudents: 'Accepted students', sPending: 'Pending requests', sLessons: 'Lessons this week', warnFull: 'Secondary 1 Mathematics is full. New requests cannot be accepted.', warnMat: "Sunday's Secondary 3 Mathematics lesson has 3 materials. Wednesday's has none yet.", openLesson: 'Open lesson', noTeachToday: 'No lessons today. Your next lesson is on Sunday.',
      rqEyebrow: 'Enrollment requests', rqTitle: 'Review who joins your groups', accept: 'Accept', reject: 'Reject', lastSeat: 'Last seat', allDone: 'No pending requests', allDoneD: 'New requests will appear here and in your notifications.', of: 'of', fullCant: 'Group is full. Increase capacity to accept.', allGroups: 'All groups', cLastT: 'Accept for the final seat?', keepReview: 'Not yet', skip: 'Skip for now',
      cgEyebrow: 'New group', cgTitle: 'Create a group', st1: 'Academic path', st2: 'Basics', st3: 'Weekly schedule', st4: 'Review', sys: 'Education system', gName: 'Group name', cap: 'Capacity', capHint: 'Between 1 and 500 students', capErr: 'Capacity must be between 1 and 500.', nameErr: 'Give the group a name.', day: 'Day', start: 'Start', end: 'End', addSlot: 'Add another time', remove: 'Remove', endErr: 'End time must be after the start time. Slots cannot cross midnight.', back: 'Back', next: 'Continue', saveDraft: 'Save as draft', publish: 'Publish group', fixConf: 'Resolve the time conflict to publish. You can still save a draft.', preview: 'Public preview', schedNote: 'Changing a schedule later updates future lessons only. Past lessons stay as they were.', stepOf: 'Step',
      lsEyebrow: 'Lesson workspace', lsTitle: 'Integration by parts', lsDate: 'Sunday 27 September', matTitle: 'Materials', allowed: 'PDF or image (JPG, PNG), up to 10 MB each.', upload: 'Upload file', tryBig: 'Try a 14 MB file', addLink: 'Add link', addNote: 'Add note', linkErr: 'Only secure https:// links can be added.', notePh: 'Write a short note for students', add: 'Add', del: 'Delete', uploading: 'Uploading', dismiss: 'Dismiss', tooBig: 'Past paper scans.pdf is 14 MB. The maximum is 10 MB.', noMat: 'No materials yet', noMatD: 'Students will see files, links and notes here once you add them.', markDone: 'Mark completed', resched: 'Reschedule', cancelLesson: 'Cancel lesson', restore: 'Restore', cCancelT: 'Cancel this lesson?', cCancelD: "Accepted students will be notified that Sunday's lesson is cancelled. Materials stay available.", keep: 'Keep lesson', privateNote: 'Visible only to accepted students of this group.', reschedNote: 'Moved to Monday 28 September, 6:00–8:00 PM. Students were notified.', cancelledNote: 'This lesson is cancelled. Students were notified.', doneNote: 'Marked as completed.',
      adEyebrow: 'Administration', adTitle: 'Platform overview', newUsers: 'New users, last 8 weeks', queueT: 'Teacher approvals', approve: 'Approve', suspend: 'Suspend', specs: 'Specializations', registered: 'Registered', queueEmpty: 'No teachers are waiting for approval.', cSuspT: 'Suspend this account?', awaiting: 'Awaiting approval', topSubj: 'Most active subjects',
      suEyebrow: 'Create account', suTitle: 'Join Dars', iam: 'I am joining as', rST: 'A student', rSD: 'Find groups, request to join and follow your timetable.', rTT: 'A teacher', rTD: 'Create groups, manage enrollment and share lesson materials.', fullName: 'Full name', email: 'Email', password: 'Password', pwHint: 'At least 8 characters.', show: 'Show', hide: 'Hide', tNote: 'Teacher accounts are reviewed by an administrator before groups can be published. You can prepare drafts in the meantime.', create: 'Create account', haveAcc: 'Already have an account? Sign in', errName: 'Enter your full name.', errEmail: 'Enter a valid email address.', errPw: 'Password must be at least 8 characters.', cancel: 'Cancel'
    },
    ar: {
      brand: 'درس', brandAlt: 'Dars', langBtn: 'English', viewAs: 'العرض كـ', student: 'طالب', teacher: 'مدرس', admin: 'مسؤول', guest: 'زائر',
      n_home: 'الرئيسية', n_discover: 'اكتشف', n_signup: 'إنشاء حساب', n_sdash: 'الرئيسية', n_stime: 'جدولي', n_tdash: 'نظرة عامة', n_treq: 'الطلبات', n_tcreate: 'مجموعة جديدة', n_lesson: 'الحصص', n_admin: 'الإدارة', signin: 'تسجيل الدخول', more: 'المزيد', screens: 'كل الشاشات', jump: 'انتقل إلى شاشة', jumpPh: 'اكتب اسم شاشة أو دور',
      eyebrow: 'الدروس الخصوصية، بشكل منظم · مصر', heroA: 'مدرسوك ومجموعاتك وأسبوعك في جدول واحد.', heroB: 'كل مجموعة. كل حصة. أسبوع واضح من أول نظرة.', heroC: 'اعثر على مجموعتك، وأسبوعك يُنظَّم تلقائيًا.',
      heroSub: 'اختر مجموعة تناسب مسارك الدراسي وقدّم طلب انضمام. بمجرد موافقة المدرس، تظهر كل الحصص وموادها في جدولك.',
      ctaFind: 'ابحث عن مجموعة', ctaTeacher: 'أنا مدرس', forPaths: 'لطلاب', how: 'كيف يعمل', howTitle: 'من البحث إلى الجدول في ثلاث خطوات',
      s1t: 'اختر مجموعة', s1d: 'صفِّ النتائج حسب النظام التعليمي والمرحلة والمادة، وقارن المواعيد والمقاعد المتاحة.', s2t: 'قدّم طلب انضمام', s2d: 'يراجع المدرس طلبك، ويمكنك متابعة حالته في أي وقت.', s3t: 'يظهر في أسبوعك', s3d: 'تظهر المجموعات المقبولة في جدولك مع كل حصة وموادها.',
      tchEyebrow: 'للمدرسين', tchTitle: 'أدِر كل مجموعاتك من مكان واحد، بدلًا من عشر محادثات.', tchCta: 'أنشئ حساب مدرس',
      f1t: 'مواعيد أسبوعية ثابتة', f1d: 'مواعيد أسبوعية مع تنبيه عند تعارضها بين مجموعاتك.', f2t: 'مراجعة الطلبات', f2d: 'اقبل الطلبات أو ارفضها والسعة المتاحة أمامك دائمًا.', f3t: 'الحصص والمواد', f3d: 'أرفق ملفات PDF وصورًا وروابط وملاحظات بكل حصة.', f4t: 'خصوصية افتراضية', f4d: 'لا يفتح مواد الحصص إلا الطلاب المقبولون.',
      privacy: 'تفاصيل الحصص والمواد متاحة للطلاب المقبولين فقط.', footer: 'المواعيد بتوقيت القاهرة', help: 'المساعدة', report: 'الإبلاغ عن مشكلة', thisWeek: 'هذا الأسبوع', accepted_demo: 'تم قبول طلبك', accepted_demo_d: 'أُضيفت رياضيات ٣ ثانوي إلى جدولك.',
      dEyebrow: 'اكتشف المجموعات', dTitle: 'مجموعات متاحة للانضمام', search: 'بحث', searchPh: 'مادة أو مقرر أو اسم مدرس', noRes: 'لا توجد مجموعات تطابق هذه الاختيارات', noResD: 'جرّب مادة أخرى، أو امسح الاختيارات لعرض كل المجموعات المنشورة.', clear: 'مسح الاختيارات', subjects: 'المادة', pathQ: 'ما مسارك الدراسي؟', subjQ: 'ما المادة؟', anySubj: 'أي مادة', results: 'النتائج',
      weekly: 'أسبوعيًا', where: 'المكان', seats: 'المقاعد', location: 'المكان', details: 'عرض التفاصيل', close: 'إغلاق', schedCairo: 'المواعيد الأسبوعية · بتوقيت القاهرة', profile: 'عرض صفحة المدرس',
      headsUp: 'تنبيه:', canStill: 'ما زال بإمكانك تقديم الطلب.', reqJoin: 'اطلب الانضمام', signinReq: 'سجّل الدخول لطلب الانضمام', pendT: 'طلبك قيد المراجعة.', pendD: 'أُرسل طلبك إلى المدرس، وسيصلك إشعار عند اتخاذ القرار.', cancelReq: 'إلغاء الطلب', accT: 'أنت عضو في هذه المجموعة.', accD: 'حصصها موجودة في جدولك.', openTT: 'افتح جدولي', fullD: 'هذه المجموعة مكتملة، ولا يمكن تقديم طلب انضمام الآن.', rejT: 'لم يُقبل طلبك السابق.', rejD: 'يمكنك إرسال طلب جديد إذا تغيّرت ظروفك.', reqAgain: 'أرسل طلبًا جديدًا',
      st_pending: 'قيد المراجعة', st_accepted: 'مقبول', st_rejected: 'مرفوض', st_full: 'مكتملة', st_cancelled: 'ملغاة', st_completed: 'تمت', st_scheduled: 'مجدولة', st_rescheduled: 'موعد معدّل', st_draft: 'مسودة', st_published: 'منشورة',
      today: 'اليوم', noToday: 'لا توجد حصص اليوم.', nextUp: 'الحصص القادمة', myReqs: 'طلبات الانضمام', myClasses: 'مجموعاتي', recentMat: 'أحدث المواد التعليمية', updates: 'التحديثات', findAnother: 'ابحث عن مجموعة أخرى', open: 'فتح', nextLesson: 'القادمة', requested: 'تاريخ الطلب', unread: 'غير مقروءة', viewAll: 'عرض الكل',
      ttEyebrow: 'جدولي', ttTitle: 'أسبوعك، بداية من الأحد', cairo: 'بتوقيت القاهرة', week: 'الأسبوع', agenda: 'القائمة', conflictT: 'تعارض في المواعيد', overlaps: 'متعارض', noLessons: 'لا حصص', legend: 'المجموعات',
      tPrimary: 'راجع الطلبات', tToday: 'حصص اليوم', tPendingT: 'طلبات قيد المراجعة', tGroups: 'مجموعاتي', tWarn: 'يحتاج انتباهك', sActive: 'مجموعات نشطة', sStudents: 'طلاب مقبولون', sPending: 'طلبات قيد المراجعة', sLessons: 'حصص هذا الأسبوع', warnFull: 'مجموعة رياضيات ١ ثانوي مكتملة، ولا يمكن قبول طلبات جديدة.', warnMat: 'حصة الأحد لرياضيات ٣ ثانوي بها ٣ مواد، وحصة الأربعاء بدون مواد حتى الآن.', openLesson: 'افتح الحصة', noTeachToday: 'لا حصص اليوم. حصتك القادمة يوم الأحد.',
      rqEyebrow: 'طلبات الانضمام', rqTitle: 'راجع من ينضم إلى مجموعاتك', accept: 'قبول', reject: 'رفض', lastSeat: 'آخر مقعد', allDone: 'لا توجد طلبات قيد المراجعة', allDoneD: 'ستظهر الطلبات الجديدة هنا وفي الإشعارات.', of: 'من', fullCant: 'المجموعة مكتملة. زِد السعة لقبول الطلب.', allGroups: 'كل المجموعات', cLastT: 'قبول الطالب في آخر مقعد؟', keepReview: 'ليس الآن', skip: 'تخطَّ الآن',
      cgEyebrow: 'مجموعة جديدة', cgTitle: 'أنشئ مجموعة', st1: 'المسار الدراسي', st2: 'البيانات الأساسية', st3: 'المواعيد الأسبوعية', st4: 'المراجعة', sys: 'النظام التعليمي', gName: 'اسم المجموعة', cap: 'السعة', capHint: 'من ١ إلى ٥٠٠ طالب', capErr: 'يجب أن تكون السعة بين ١ و٥٠٠.', nameErr: 'اكتب اسمًا للمجموعة.', day: 'اليوم', start: 'البداية', end: 'النهاية', addSlot: 'أضف موعدًا آخر', remove: 'حذف', endErr: 'يجب أن يكون وقت النهاية بعد البداية، ولا يمكن أن يمتد الموعد بعد منتصف الليل.', back: 'رجوع', next: 'متابعة', saveDraft: 'حفظ كمسودة', publish: 'نشر المجموعة', fixConf: 'حُلّ تعارض المواعيد لنشر المجموعة، ويمكنك حفظها كمسودة.', preview: 'معاينة الصفحة العامة', schedNote: 'تعديل المواعيد لاحقًا يغيّر الحصص القادمة فقط، وتبقى الحصص السابقة كما هي.', stepOf: 'الخطوة',
      lsEyebrow: 'مساحة الحصة', lsTitle: 'التكامل بالتجزئة', lsDate: 'الأحد ٢٧ سبتمبر', matTitle: 'المواد التعليمية', allowed: 'ملفات PDF أو صور (JPG, PNG) بحد أقصى ١٠ ميجابايت للملف.', upload: 'رفع ملف', tryBig: 'جرّب ملفًا بحجم ١٤ ميجابايت', addLink: 'إضافة رابط', addNote: 'إضافة ملاحظة', linkErr: 'يمكن إضافة روابط https:// الآمنة فقط.', notePh: 'اكتب ملاحظة قصيرة للطلاب', add: 'إضافة', del: 'حذف', uploading: 'جارٍ الرفع', dismiss: 'إخفاء', tooBig: 'حجم الملف Past paper scans.pdf هو ١٤ ميجابايت، والحد الأقصى ١٠ ميجابايت.', noMat: 'لا توجد مواد بعد', noMatD: 'سيرى الطلاب هنا الملفات والروابط والملاحظات بمجرد إضافتها.', markDone: 'تحديد كمكتملة', resched: 'تغيير الموعد', cancelLesson: 'إلغاء الحصة', restore: 'استعادة', cCancelT: 'إلغاء هذه الحصة؟', cCancelD: 'سيصل إشعار للطلاب المقبولين بإلغاء حصة الأحد، وتبقى المواد متاحة.', keep: 'الإبقاء على الحصة', privateNote: 'مرئية فقط للطلاب المقبولين في هذه المجموعة.', reschedNote: 'نُقلت إلى الاثنين ٢٨ سبتمبر، ٦:٠٠–٨:٠٠ م. تم إشعار الطلاب.', cancelledNote: 'هذه الحصة ملغاة. تم إشعار الطلاب.', doneNote: 'تم تحديد الحصة كمكتملة.',
      adEyebrow: 'الإدارة', adTitle: 'نظرة عامة على المنصة', newUsers: 'مستخدمون جدد، آخر ٨ أسابيع', queueT: 'اعتماد المدرسين', approve: 'اعتماد', suspend: 'إيقاف', specs: 'التخصصات', registered: 'تاريخ التسجيل', queueEmpty: 'لا يوجد مدرسون بانتظار الاعتماد.', cSuspT: 'إيقاف هذا الحساب؟', awaiting: 'بانتظار الاعتماد', topSubj: 'المواد الأكثر نشاطًا',
      suEyebrow: 'إنشاء حساب', suTitle: 'انضم إلى درس', iam: 'أنضم بصفتي', rST: 'طالب', rSD: 'اعثر على مجموعات، واطلب الانضمام، وتابع جدولك.', rTT: 'مدرس', rTD: 'أنشئ مجموعات، وأدِر الطلبات، وشارك مواد الحصص.', fullName: 'الاسم بالكامل', email: 'البريد الإلكتروني', password: 'كلمة المرور', pwHint: '٨ أحرف على الأقل.', show: 'إظهار', hide: 'إخفاء', tNote: 'يراجع أحد المسؤولين حسابات المدرسين قبل نشر المجموعات، ويمكنك تجهيز مسودات في هذه الأثناء.', create: 'إنشاء الحساب', haveAcc: 'لديك حساب بالفعل؟ سجّل الدخول', errName: 'اكتب اسمك بالكامل.', errEmail: 'اكتب بريدًا إلكترونيًا صحيحًا.', errPw: 'يجب ألا تقل كلمة المرور عن ٨ أحرف.', cancel: 'إلغاء'
    }
  };
  const NAV = { guest: ['home', 'discover', 'signup'], student: ['sdash', 'discover', 'stime'], teacher: ['tdash', 'treq', 'tcreate', 'lesson'], admin: ['admin'] };
  const HOME = { guest: 'home', student: 'sdash', teacher: 'tdash', admin: 'admin' };
  const SCREENS = [['home', 'guest'], ['discover', 'student'], ['signup', 'guest'], ['sdash', 'student'], ['stime', 'student'], ['tdash', 'teacher'], ['tcreate', 'teacher'], ['treq', 'teacher'], ['lesson', 'teacher'], ['admin', 'admin']];
  const SCREEN_LABEL = { home: ['Home / landing', 'الصفحة الرئيسية'], discover: ['Discover groups', 'اكتشف المجموعات'], signup: ['Create account', 'إنشاء حساب'], sdash: ['Student dashboard', 'لوحة الطالب'], stime: ['Student timetable', 'جدول الطالب'], tdash: ['Teacher dashboard', 'لوحة المدرس'], tcreate: ['Create group', 'إنشاء مجموعة'], treq: ['Enrollment requests', 'طلبات الانضمام'], lesson: ['Lesson workspace', 'مساحة الحصة'], admin: ['Admin & approvals', 'الإدارة والاعتماد'] };

  function cairoParts() {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date());
    const wd = f.find(p => p.type === 'weekday').value, hr = +f.find(p => p.type === 'hour').value;
    return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd), hour: hr % 24 };
  }
  function initState() {
    return {
      lang: 'en', role: 'student', screen: 'home', q: '', path: 'All', subj: null, open: null, req: { g4: 'accepted', g5: 'rejected' }, reqDate: {}, extra: {},
      treq: TREQ0.map(r => ({ ...r, st: 'pending' })), notes: NOTES0.slice(), toast: null, day: cairoParts().day, tview: 'week', now: '', confirm: null,
      wz: { step: 0, sys: 'National', lvl: 'Secondary', grd: 'Secondary 3', sub: 'Mathematics', name: 'Secondary 3 Mathematics — Weekend', cap: '25', loc: 'Nasr City, Cairo', slots: [{ d: 0, s: 18.5, e: 20 }] },
      mats: MAT0.slice(), ups: [], linkOpen: false, link: '', linkErr: false, noteOpen: false, note: '', lstatus: 'scheduled',
      queue: QUEUE0.slice(), aSel: 'a1', su: { role: 'student', name: '', email: '', pw: '', show: false, tried: false }, newGroups: [], cmd: false, cmdQ: '', narrow: false, rqIdx: 0
    };
  }

  function build(c) {
    const s = c.state, A = s.lang === 'ar', t = T[s.lang], P = c.PAL || {};
    const tx = p => p[A ? 1 : 0];
    const dg = v => A ? String(v).replace(/\d/g, d => DG[d]) : String(v);
    const tm = h => dg(`${Math.floor(h) % 12 || 12}:${h % 1 ? '30' : '00'}`);
    const ap = h => h >= 12 ? (A ? 'م' : 'PM') : (A ? 'ص' : 'AM');
    const rng = (a, b) => `${tm(a)}–${tm(b)} ${ap(b)}`;
    const short = d => A ? DAYS[d][1] : DAYS[d][0].slice(0, 3);
    const SC = c.SUBJ || [['#d5ebe6', '#0d4a4b'], ['#dde5f4', '#1e3c78'], ['#f4e0cf', '#83390c'], ['#dfedd5', '#2c5620'], ['#ebdff1', '#582b72'], ['#f5e6c6', '#6a4b08']];
    const BD = c.BADGE || {};
    const badge = k => { const b = BD[k] || ['#eee', '#333']; return { label: t['st_' + k], bg: b[0], fg: b[1], key: k }; };
    const set = p => c.setState(p);
    const go = scr => { c.setState({ screen: scr, open: null, cmd: false }); c.scrollTop && c.scrollTop(); };
    const say = msg => { clearTimeout(c._tt); c.setState({ toast: msg }); c._tt = setTimeout(() => c.setState({ toast: null }), 4200); };
    const on = (c.CHIP || {}).on || ['#000', '#fff', '#000'], off = (c.CHIP || {}).off || ['transparent', '#000', '#ccc'];
    const chip = a => ({ bg: a ? on[0] : off[0], fg: a ? on[1] : off[1], bd: a ? on[2] : off[2] });
    const sched = g => {
      const m = {};
      g.slots.forEach(([d, a, b]) => { const k = a + '-' + b; (m[k] = m[k] || { a, b, d: [] }).d.push(d); });
      return Object.values(m).map(x => x.d.map(short).join(A ? ' و' : ' & ') + ' · ' + rng(x.a, x.b)).join('  /  ');
    };
    const taken = g => g.taken + (s.extra[g.id] || 0) + (s.req[g.id] === 'accepted' && g.id !== 'g4' ? 1 : 0);
    const mine = G.filter(g => s.req[g.id] === 'accepted');
    const owned = G.filter(g => g.owner);
    const overlaps = (slots, pool, selfId) => {
      const out = [];
      slots.forEach(([d, a, b]) => pool.forEach(o => { if (o.id === selfId) return; o.slots.forEach(([d2, a2, b2]) => { if (d === d2 && a < b2 && a2 < b) out.push({ o, d: d2, a: a2, b: b2 }); }); }));
      return out;
    };
    const ovText = x => A ? `هذا الموعد يتعارض مع ${tx(x.o.name)}، ${DAYS[x.d][1]} ${rng(x.a, x.b)}.` : `This time overlaps with ${tx(x.o.name)}, ${DAYS[x.d][0]} ${rng(x.a, x.b)}.`;
    const initial = n => n.replace('Dr. ', '').replace('د. ', '')[0];
    const pn = n => A ? `${dg(n)} ${n > 10 ? 'مقعدًا متاحًا' : n === 1 ? 'مقعد متاح' : 'مقاعد متاحة'}` : `${n} seat${n === 1 ? '' : 's'} left`;
    const cp = cairoParts();

    const request = id => {
      const g = G.find(x => x.id === id);
      c.setState(st => ({ req: { ...st.req, [id]: 'pending' }, reqDate: { ...st.reqDate, [id]: true } }));
      say(A ? 'تم إرسال طلبك إلى المدرس.' : 'Your request was sent to the teacher.');
      clearTimeout(c._acc);
      c._acc = setTimeout(() => {
        if (c.state.req[id] !== 'pending' || c.state.role === 'teacher') return;
        c.setState(st => ({ req: { ...st.req, [id]: 'accepted' }, notes: [{ id: 'n' + Date.now(), x: [`${g.t[0]} accepted your request for ${g.name[0]}.`, `وافق ${g.t[1]} على طلبك في ${g.name[1]}.`], w: ['Just now', 'الآن'], u: true }, ...st.notes] }));
        say(A ? `وافق ${g.t[1]} على طلبك، وأُضيفت المجموعة إلى جدولك.` : `${g.t[0]} accepted your request. The group is now in your timetable.`);
      }, 4500);
    };
    const cancelReq = id => { c.setState(st => { const r = { ...st.req }; delete r[id]; return { req: r }; }); say(A ? 'تم إلغاء الطلب.' : 'Request cancelled.'); };

    // discover
    const q = s.q.trim().toLowerCase();
    const inPath = G.filter(g => s.path === 'All' || g.path === s.path);
    const list = inPath.filter(g => (!s.subj || g.subj[0] === s.subj) && (!q || [g.name, g.t, g.subj].some(p => p.join(' ').toLowerCase().includes(q))));
    const card = g => {
      const tk = taken(g), st = s.req[g.id], full = tk >= g.cap && st !== 'accepted', n = g.cap - tk, col = SC[g.c];
      return {
        id: g.id, name: tx(g.name), teacher: tx(g.t), initial: initial(tx(g.t)), subj: tx(g.subj), crumb: tx(g.cr).join(A ? ' ‹ ' : ' › '), crumbs: tx(g.cr).map((x, i, a) => ({ x, last: i === a.length - 1 })),
        sched: sched(g), loc: tx(g.loc), desc: tx(g.d), seats: dg(`${tk}/${g.cap}`), left: full ? t.st_full : pn(n), pct: `${Math.round(Math.min(tk / g.cap, 1) * 100)}%`,
        full, pending: st === 'pending', accepted: st === 'accepted', rejected: st === 'rejected' && !full, available: !st && !full, guest: s.role === 'guest',
        hasBadge: !!st || full, badge: badge(full ? 'full' : st || 'pending'), bg: col[0], fg: col[1], num: dg(String(G.indexOf(g) + 1).padStart(2, '0')),
        onOpen: () => set({ open: g.id })
      };
    };
    const cards = list.map(card);
    let sel = null;
    if (s.open) {
      const g = G.find(x => x.id === s.open), cc = card(g), ov = overlaps(g.slots, mine, g.id);
      sel = { ...cc, slots: g.slots.map(([d, a, b]) => ({ day: tx(DAYS[d]), time: rng(a, b) })), conflict: ov[0] ? ovText(ov[0]) : '', hasConflict: ov.length > 0 && !cc.accepted && !cc.full,
        canReq: (cc.available || cc.rejected) && s.role !== 'guest', guestReq: s.role === 'guest' && !cc.full,
        request: () => request(g.id), cancel: () => cancelReq(g.id), goTimetable: () => go('stime'), signin: () => go('signup') };
    }
    const subjSet = [...new Map(inPath.map(g => [g.subj[0], g.subj])).values()];

    // timetable
    const blocks = [];
    mine.forEach(g => g.slots.forEach(([d, a, b]) => blocks.push({ g, d, a, b })));
    const clash = new Set();
    blocks.forEach(x => blocks.forEach(y => { if (x.g !== y.g && x.d === y.d && x.a < y.b && y.a < x.b) clash.add(x); }));
    const H = c.H || 44, H0 = 10;
    const mk = x => {
      const ex = EX[x.g.id + '-' + x.d], col = SC[x.g.c];
      return { id: x.g.id, title: tx(x.g.subj), name: tx(x.g.name), teacher: tx(x.g.t), loc: tx(x.g.loc), time: rng(x.a, x.b), day: tx(DAYS[x.d]), dayShort: short(x.d), bg: col[0], fg: col[1], top: `${(x.a - H0) * H}px`, h: `${(x.b - x.a) * H - 4}px`, clash: clash.has(x), hasEx: !!ex, ex: ex ? badge(ex) : badge('scheduled'), cancelled: ex === 'cancelled', open: () => set({ open: x.g.id }) };
    };
    const week = DAYS.map((d, i) => {
      const items = blocks.filter(x => x.d === i).sort((x, y) => x.a - y.a).map(mk), act = s.day === i;
      return { label: tx(d), short: short(i), items, has: items.length > 0, none: !items.length, count: dg(items.length), isToday: i === cp.day, active: act, ...chip(act), pick: () => set({ day: i }) };
    });
    const cx = [...clash][0], co = cx ? blocks.find(y => y.g !== cx.g && y.d === cx.d && cx.a < y.b && y.a < cx.b) : null;
    const clashText = cx ? (A ? `${tx(cx.g.name)} يتعارض مع ${tx(co.g.name)} يوم ${DAYS[cx.d][1]}، ${rng(co.a, co.b)}.` : `${tx(cx.g.name)} overlaps with ${tx(co.g.name)} on ${DAYS[cx.d][0]}, ${rng(co.a, co.b)}.`) : '';
    const order = [...Array(7)].map((_, i) => (cp.day + i) % 7);
    const upcoming = order.slice(1).flatMap(d => week[d].items).slice(0, 4);

    // student
    const myReqs = G.filter(g => s.req[g.id]).map(g => ({ id: g.id, name: tx(g.name), teacher: tx(g.t), badge: badge(s.req[g.id]), date: s.reqDate[g.id] ? t.today : (A ? '٢ سبتمبر' : 'Sep 2'), pending: s.req[g.id] === 'pending', open: () => set({ open: g.id }), cancel: () => cancelReq(g.id) }));
    const classes = mine.map(g => { const nx = order.flatMap(d => week[d].items).find(b => b.id === g.id); return { id: g.id, name: tx(g.name), teacher: tx(g.t), sched: sched(g), next: nx ? `${nx.day} · ${nx.time}` : '', bg: SC[g.c][0], fg: SC[g.c][1], subj: tx(g.subj), open: () => set({ open: g.id }) }; });
    const greet = (cp.hour < 12 ? (A ? 'صباح الخير' : 'Good morning') : cp.hour < 17 ? (A ? 'مساء الخير' : 'Good afternoon') : (A ? 'مساء الخير' : 'Good evening'));

    // teacher
    const yaraReqs = owned.filter(g => s.req[g.id] === 'pending').map(g => ({ id: 'yara-' + g.id, yara: g.id, n: ['Yara Mahmoud', 'يارا محمود'], g: g.id, d: ['Today', 'اليوم'], st: 'pending' }));
    const pend = [...yaraReqs, ...s.treq.filter(r => r.st === 'pending')];
    const doAccept = r => {
      const g = G.find(x => x.id === r.g);
      if (r.yara) c.setState(st => ({ req: { ...st.req, [r.yara]: 'accepted' } }));
      else c.setState(st => ({ treq: st.treq.map(x => x.id === r.id ? { ...x, st: 'accepted' } : x), extra: { ...st.extra, [g.id]: (st.extra[g.id] || 0) + 1 } }));
      c.setState({ confirm: null });
      say(A ? `تم قبول ${r.n[1]} في ${g.name[1]}.` : `${r.n[0]} was accepted into ${g.name[0]}.`);
    };
    const doReject = r => {
      const g = G.find(x => x.id === r.g);
      if (r.yara) c.setState(st => ({ req: { ...st.req, [r.yara]: 'rejected' } }));
      else c.setState(st => ({ treq: st.treq.map(x => x.id === r.id ? { ...x, st: 'rejected' } : x) }));
      say(A ? `تم رفض طلب ${r.n[1]}.` : `${r.n[0]}'s request was rejected.`);
    };
    const treqs = pend.map(r => {
      const g = G.find(x => x.id === r.g), tk = taken(g), left = g.cap - tk;
      return { id: r.id, student: tx(r.n), initial: tx(r.n)[0], group: tx(g.name), date: tx(r.d), seats: dg(`${tk}/${g.cap}`), pct: `${Math.round(Math.min(tk / g.cap, 1) * 100)}%`, left: left <= 0 ? t.st_full : pn(left), lastSeat: left === 1, full: left <= 0, canAccept: left > 0,
        accept: () => { if (left <= 0) return say(t.fullCant); if (left === 1) return set({ confirm: { kind: 'last', r } }); doAccept(r); }, reject: () => doReject(r) };
    });
    const rqI = Math.min(s.rqIdx, Math.max(treqs.length - 1, 0));
    const tBlocks = owned.flatMap(g => g.slots.map(([d, a, b]) => ({ g, d, a, b })));
    const tToday = tBlocks.filter(x => x.d === cp.day).map(x => ({ name: tx(x.g.name), time: rng(x.a, x.b), loc: tx(x.g.loc), seats: dg(`${taken(x.g)}/${x.g.cap}`), open: () => go('lesson') }));
    const tGroups = owned.map(g => { const tk = taken(g); return { name: tx(g.name), crumb: tx(g.cr).join(A ? ' ‹ ' : ' › '), badge: badge('published'), seats: dg(`${tk}/${g.cap}`), pct: `${Math.round(Math.min(tk / g.cap, 1) * 100)}%`, sched: sched(g), full: tk >= g.cap }; })
      .concat(s.newGroups.map(n => ({ name: n.name, crumb: n.crumb, badge: badge(n.status), seats: dg(`0/${n.cap}`), pct: '0%', sched: n.sched, full: false })));
    const tStats = [[t.sActive, owned.length + s.newGroups.filter(n => n.status === 'published').length], [t.sStudents, owned.reduce((a, g) => a + taken(g), 0)], [t.sPending, pend.length], [t.sLessons, tBlocks.length]].map(([l, v]) => ({ label: l, value: dg(v) }));

    // create group wizard
    const w = s.wz, tr = TREE[w.sys];
    const setWz = p => c.setState(st => ({ wz: { ...st.wz, ...p } }));
    const levels = tr.l.map(l => ({ label: tx(l), ...chip(w.lvl === l[0]), pick: () => setWz({ lvl: l[0], grd: tr.g[l[0]][0][0] }) }));
    const grades = (tr.g[w.lvl] || []).map(g => ({ label: tx(g), ...chip(w.grd === g[0]), pick: () => setWz({ grd: g[0] }) }));
    const subs = tr.s.map(x => ({ label: tx(x), ...chip(w.sub === x[0]), pick: () => setWz({ sub: x[0] }) }));
    const systems = SYS.map(x => ({ label: tx(x), ...chip(w.sys === x[0]), pick: () => { const T2 = TREE[x[0]]; setWz({ sys: x[0], lvl: T2.l[0][0], grd: T2.g[T2.l[0][0]][0][0], sub: T2.s[0][0] }); } }));
    const find = (arr, k) => (arr.find(x => x[0] === k) || [k, k]);
    const wCrumb = [find(SYS, w.sys), find(tr.l, w.lvl), find(tr.g[w.lvl] || [], w.grd), find(tr.s, w.sub)].map(tx).join(A ? ' ‹ ' : ' › ');
    const capN = +w.cap, capBad = !(Number.isInteger(capN) && capN >= 1 && capN <= 500), nameBad = !w.name.trim();
    const pool = owned.concat(s.newGroups.filter(n => n.status === 'published').map(n => ({ id: n.id, name: [n.name, n.name], slots: n.slots })));
    const times = []; for (let h = 8; h <= 23.5; h += 0.5) times.push({ v: String(h), label: `${tm(h)} ${ap(h)}` });
    const dayOpts = DAYS.map((d, i) => ({ v: String(i), label: tx(d) }));
    let anyConf = false, anyErr = false;
    const wSlots = w.slots.map((sl, i) => {
      const ov = overlaps([[sl.d, sl.s, sl.e]], pool, null).concat(w.slots.filter((o, j) => j !== i && o.d === sl.d && sl.s < o.e && o.s < sl.e).map(o => ({ o: { name: [w.name || 'this group', w.name || 'هذه المجموعة'] }, d: o.d, a: o.s, b: o.e })));
      const err = sl.e <= sl.s; if (ov.length) anyConf = true; if (err) anyErr = true;
      const upd = p => setWz({ slots: w.slots.map((x, j) => j === i ? { ...x, ...p } : x) });
      return { n: dg(i + 1), dv: String(sl.d), sv: String(sl.s), ev: String(sl.e), onDay: e => upd({ d: +e.target.value }), onStart: e => upd({ s: +e.target.value }), onEnd: e => upd({ e: +e.target.value }),
        hasConf: ov.length > 0, conf: ov[0] ? ovText(ov[0]) : '', err, label: `${tx(DAYS[sl.d])} · ${rng(sl.s, sl.e)}`, canRemove: w.slots.length > 1, remove: () => setWz({ slots: w.slots.filter((_, j) => j !== i) }) };
    });
    const stepOk = [true, !capBad && !nameBad, !anyErr, true];
    const save = status => {
      const id = 'n' + Date.now();
      c.setState(st => ({ newGroups: [...st.newGroups, { id, name: w.name, crumb: wCrumb, cap: w.cap, status, slots: w.slots.map(x => [x.d, x.s, x.e]), sched: w.slots.map(x => `${short(x.d)} · ${rng(x.s, x.e)}`).join('  /  ') }], wz: { ...initState().wz } }));
      say(status === 'published' ? (A ? `تم نشر ${w.name}.` : `${w.name} is published.`) : (A ? `حُفظت ${w.name} كمسودة.` : `${w.name} was saved as a draft.`));
      go('tdash');
    };
    const wz = {
      step: w.step, stepN: dg(w.step + 1), steps: [t.st1, t.st2, t.st3, t.st4].map((l, i) => ({ label: l, n: dg(i + 1), active: i === w.step, done: i < w.step, ...chip(i <= w.step), go: () => { if (i <= w.step || stepOk.slice(0, i).every(Boolean)) setWz({ step: i }); } })),
      s1: w.step === 0, s2: w.step === 1, s3: w.step === 2, s4: w.step === 3, notFirst: w.step > 0, notLast: w.step < 3, isLast: w.step === 3,
      systems, levels, grades, subs, lab: A ? tr.labAr : tr.lab, crumb: wCrumb,
      name: w.name, onName: e => setWz({ name: e.target.value }), cap: w.cap, onCap: e => setWz({ cap: e.target.value }), loc: w.loc, onLoc: e => setWz({ loc: e.target.value }),
      capBad, nameBad, slots: wSlots, times, dayOpts, addSlot: () => setWz({ slots: [...w.slots, { d: 4, s: 17, e: 18.5 }] }), anyConf, anyErr, canPublish: !anyConf && !anyErr,
      next: () => { if (stepOk[w.step]) setWz({ step: Math.min(3, w.step + 1) }); }, back: () => setWz({ step: Math.max(0, w.step - 1) }), nextOk: stepOk[w.step],
      draft: () => save('draft'), publish: () => { if (!anyConf && !anyErr) save('published'); }, schedSum: wSlots.map(x => x.label).join('  /  ')
    };

    // lesson
    const kind = { pdf: ['PDF', 'PDF'], img: ['Image', 'صورة'], link: ['Link', 'رابط'], note: ['Note', 'ملاحظة'] };
    const mats = s.mats.map(m => ({ id: m.id, kind: tx(kind[m.type]), tag: m.type === 'pdf' ? 'PDF' : m.type === 'img' ? 'IMG' : m.type === 'link' ? 'URL' : 'TXT', title: tx(m.title), meta: tx(m.meta), isNote: m.type === 'note', del: () => c.setState(st => ({ mats: st.mats.filter(x => x.id !== m.id) })) }));
    const upload = () => {
      const id = 'u' + Date.now();
      c.setState(st => ({ ups: [...st.ups, { id, name: 'Past paper 2025.pdf', pct: 0 }] }));
      const iv = setInterval(() => {
        const u = c.state.ups.find(x => x.id === id); if (!u) return clearInterval(iv);
        if (u.pct >= 100) { clearInterval(iv); c.setState(st => ({ ups: st.ups.filter(x => x.id !== id), mats: [...st.mats, { id, type: 'pdf', title: ['Past paper 2025', 'امتحان سابق ٢٠٢٥'], meta: ['PDF · 2.4 MB · Today', 'PDF · ٢٫٤ ميجابايت · اليوم'] }] })); say(A ? 'تم رفع الملف.' : 'File uploaded.'); return; }
        c.setState(st => ({ ups: st.ups.map(x => x.id === id ? { ...x, pct: Math.min(100, x.pct + 9) } : x) }));
      }, 110);
    };
    const ups = s.ups.map(u => ({ name: u.name, pct: dg(u.pct) + '%', w: u.pct + '%', err: !!u.err, busy: !u.err, errText: t.tooBig, dismiss: () => c.setState(st => ({ ups: st.ups.filter(x => x.id !== u.id) })) }));
    const addLink = () => {
      const v = s.link.trim();
      if (!/^https:\/\/[^\s.]+\.[^\s]+/.test(v)) return set({ linkErr: true });
      const host = v.replace('https://', '').split('/')[0];
      c.setState(st => ({ mats: [...st.mats, { id: 'l' + Date.now(), type: 'link', title: [host, host], meta: ['Link · ' + host, 'رابط · ' + host] }], link: '', linkErr: false, linkOpen: false }));
    };
    const addNote = () => { const v = s.note.trim(); if (!v) return; c.setState(st => ({ mats: [...st.mats, { id: 'x' + Date.now(), type: 'note', title: [v, v], meta: ['Note', 'ملاحظة'] }], note: '', noteOpen: false })); };
    const g1 = G[0], ls = s.lstatus;
    const lesson = {
      title: t.lsTitle, group: tx(g1.name), date: ls === 'rescheduled' ? (A ? 'الاثنين ٢٨ سبتمبر' : 'Monday 28 September') : t.lsDate, time: rng(18, 20), loc: tx(g1.loc), badge: badge(ls), seats: dg(`${taken(g1)}/${g1.cap}`),
      isSched: ls === 'scheduled', isDone: ls === 'completed', isCancelled: ls === 'cancelled', isResched: ls === 'rescheduled', notSched: ls !== 'scheduled',
      note: ls === 'rescheduled' ? t.reschedNote : ls === 'cancelled' ? t.cancelledNote : ls === 'completed' ? t.doneNote : '',
      mats, hasMats: mats.length > 0, noMats: !mats.length, ups, hasUps: ups.length > 0, matCount: dg(mats.length),
      upload, uploadBig: () => c.setState(st => ({ ups: [...st.ups, { id: 'b' + Date.now(), name: 'Past paper scans.pdf', pct: 0, err: 'big' }] })),
      linkOpen: s.linkOpen, toggleLink: () => set({ linkOpen: !s.linkOpen, noteOpen: false, linkErr: false }), link: s.link, onLink: e => set({ link: e.target.value, linkErr: false }), linkErr: s.linkErr, addLink,
      noteOpen: s.noteOpen, toggleNote: () => set({ noteOpen: !s.noteOpen, linkOpen: false }), noteV: s.note, onNote: e => set({ note: e.target.value }), addNote,
      markDone: () => { set({ lstatus: 'completed' }); say(t.doneNote); }, resched: () => { set({ lstatus: 'rescheduled' }); say(t.reschedNote); }, cancel: () => set({ confirm: { kind: 'cancelLesson' } }), restore: () => set({ lstatus: 'scheduled' })
    };

    // admin
    const qSel = s.queue.find(x => x.id === s.aSel) || s.queue[0];
    const approve = x => { const rest = s.queue.filter(y => y.id !== x.id); c.setState({ queue: rest, aSel: rest[0] ? rest[0].id : null, confirm: null }); say(A ? `تم اعتماد ${x.n[1]} ويمكنه الآن نشر المجموعات.` : `${x.n[0]} is approved and can now publish groups.`); };
    const admin = {
      stats: [[A ? 'طلاب نشطون' : 'Active students', 1284, ''], [A ? 'مدرسون نشطون' : 'Active teachers', 86, A ? `${dg(s.queue.length)} بانتظار الاعتماد` : `${s.queue.length} awaiting approval`], [A ? 'مجموعات منشورة' : 'Published groups', 142, A ? '٣١ مسودة · ١٢ مؤرشفة' : '31 draft · 12 archived'], [A ? 'حصص هذا الأسبوع' : 'Lessons this week', 418, ''], [A ? 'طلبات انضمام معلقة' : 'Pending enrollments', 57, ''], [A ? 'بلاغات مفتوحة' : 'Open reports', 4, '']].map(([l, v, sub]) => ({ label: l, value: A ? v.toLocaleString('ar-EG') : v.toLocaleString('en-US'), sub, hasSub: !!sub })),
      bars: [42, 55, 48, 70, 64, 81, 77, 96].map((v, i) => ({ h: v + '%', v: dg(v * 3), label: A ? `أ${dg(i + 1)}` : `W${i + 1}`, last: i === 7 })),
      subjects: [['Mathematics', 'الرياضيات', 38], ['Physics', 'الفيزياء', 24], ['Chemistry', 'الكيمياء', 19], ['English', 'الإنجليزية', 12]].map(x => ({ label: tx(x), w: x[2] * 2.4 + '%', v: dg(x[2]) })),
      queue: s.queue.map(x => ({ id: x.id, name: tx(x.n), initial: tx(x.n).replace('Dr. ', '').replace('د. ', '')[0], head: tx(x.h), date: tx(x.d), active: qSel && qSel.id === x.id, ...chip(qSel && qSel.id === x.id), pick: () => set({ aSel: x.id }) })),
      qCount: dg(s.queue.length), empty: !s.queue.length, has: s.queue.length > 0,
      sel: qSel ? { name: tx(qSel.n), initial: tx(qSel.n).replace('Dr. ', '').replace('د. ', '')[0], head: tx(qSel.h), bio: tx(qSel.b), specs: qSel.sp.map(x => ({ x: tx(x) })), date: tx(qSel.d), approve: () => approve(qSel), suspend: () => set({ confirm: { kind: 'suspend', x: qSel } }) } : null
    };

    // signup
    const u = s.su, setSu = p => c.setState(st => ({ su: { ...st.su, ...p } }));
    const eName = !u.name.trim(), eEmail = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email), ePw = u.pw.length < 8;
    const su = {
      roles: [['student', t.rST, t.rSD], ['teacher', t.rTT, t.rTD]].map(([k, ti, d]) => ({ key: k, title: ti, desc: d, active: u.role === k, ...chip(u.role === k), pick: () => setSu({ role: k }) })),
      isTeacher: u.role === 'teacher', name: u.name, email: u.email, pw: u.pw, onName: e => setSu({ name: e.target.value }), onEmail: e => setSu({ email: e.target.value }), onPw: e => setSu({ pw: e.target.value }),
      pwType: u.show ? 'text' : 'password', showLabel: u.show ? t.hide : t.show, toggleShow: () => setSu({ show: !u.show }),
      eName: u.tried && eName, eEmail: u.tried && eEmail, ePw: u.tried && ePw, pwOk: u.pw.length >= 8, pwW: Math.min(100, u.pw.length / 8 * 100) + '%',
      submit: e => { if (e && e.preventDefault) e.preventDefault(); if (eName || eEmail || ePw) return setSu({ tried: true }); const r = u.role; c.setState({ role: r, su: initState().su }); go(HOME[r]); say(r === 'teacher' ? (A ? 'تم إنشاء حسابك. يمكنك تجهيز المسودات حتى يتم اعتمادك.' : 'Account created. You can prepare drafts while your profile awaits approval.') : (A ? 'تم إنشاء حسابك. مرحبًا بك في درس.' : 'Account created. Welcome to Dars.')); }
    };

    // confirm dialog
    let confirm = null;
    if (s.confirm) {
      const k = s.confirm.kind, no = () => set({ confirm: null });
      if (k === 'last') { const r = s.confirm.r, g = G.find(x => x.id === r.g); confirm = { title: t.cLastT, body: A ? `سيحصل ${r.n[1]} على آخر مقعد في ${g.name[1]}، وستظهر المجموعة بعدها مكتملة.` : `${r.n[0]} will take the last seat in ${g.name[0]}. The group will then show as full.`, ok: () => doAccept(r), okLabel: t.accept, no, noLabel: t.keepReview, danger: false }; }
      if (k === 'cancelLesson') confirm = { title: t.cCancelT, body: t.cCancelD, ok: () => { c.setState({ lstatus: 'cancelled', confirm: null }); say(t.cancelledNote); }, okLabel: t.cancelLesson, no, noLabel: t.keep, danger: true };
      if (k === 'suspend') { const x = s.confirm.x; confirm = { title: t.cSuspT, body: A ? `سيتم تسجيل خروج ${x.n[1]}، ولن يتمكن من استخدام درس حتى تتم إعادة تفعيل الحساب.` : `${x.n[0]} will be signed out and won't be able to use Dars until the account is reactivated.`, ok: () => { const rest = s.queue.filter(y => y.id !== x.id); c.setState({ queue: rest, aSel: rest[0] ? rest[0].id : null, confirm: null }); say(A ? `تم إيقاف حساب ${x.n[1]}.` : `${x.n[0]}'s account is suspended.`); }, okLabel: t.suspend, no, noLabel: t.cancel, danger: true }; }
    }

    const role = s.role;
    const navKeys = NAV[role];
    const nav = navKeys.map(k => ({ key: k, label: t['n_' + k], active: s.screen === k, ...chip(s.screen === k), go: () => go(k) }));
    const roles = ['guest', 'student', 'teacher', 'admin'].map(r => ({ key: r, label: t[r], active: role === r, ...chip(role === r), pick: () => { c.setState({ role: r }); go(HOME[r]); } }));
    const cq = s.cmdQ.trim().toLowerCase();
    const allScreens = SCREENS.map(([k, r]) => ({ key: k, label: tx(SCREEN_LABEL[k]), role: t[r], active: s.screen === k, go: () => { c.setState({ role: r === 'guest' && k === 'discover' ? role : r }); go(k); } })).filter(x => !cq || (x.label + ' ' + x.role).toLowerCase().includes(cq));
    const sc = {}; SCREENS.forEach(([k]) => sc[k] = s.screen === k);
    const who = role === 'teacher' ? (A ? 'منى' : 'Mona') : role === 'admin' ? (A ? 'مريم' : 'Mariam') : (A ? 'يارا' : 'Yara');
    const F = (c.FONTS || {})[s.lang] || {};
    return {
      t, dir: A ? 'rtl' : 'ltr', isAr: A, lang: s.lang, font: F.body, dfont: F.display || F.body, toggleLang: () => set({ lang: A ? 'en' : 'ar' }),
      role, roles, nav, sc, screen: s.screen, screenLabel: tx(SCREEN_LABEL[s.screen]), allScreens, narrow: s.narrow, wide: !s.narrow,
      isGuest: role === 'guest', signedIn: role !== 'guest', who, whoInitial: who[0], roleLabel: t[role], greet: `${greet}${A ? ' يا ' : ', '}${who}`,
      goto: Object.fromEntries(SCREENS.map(([k]) => [k, () => go(k)]).concat([['myHome', () => go(HOME[role])], ['teacherSignup', () => { c.setState(st => ({ su: { ...st.su, role: 'teacher' } })); go('signup'); }]])),
      cmdOpen: s.cmd, openCmd: () => set({ cmd: true, cmdQ: '' }), closeCmd: () => set({ cmd: false }), cmdQ: s.cmdQ, onCmdQ: e => set({ cmdQ: e.target.value }),
      q: s.q, onQ: e => set({ q: e.target.value }), paths: PATHS.map(p => ({ label: tx(p), key: p[0], active: s.path === p[0], ...chip(s.path === p[0]), pick: () => set({ path: p[0], subj: null }) })),
      subjects: [{ label: t.anySubj, ...chip(!s.subj), pick: () => set({ subj: null }) }].concat(subjSet.map(x => ({ label: tx(x), ...chip(s.subj === x[0]), pick: () => set({ subj: x[0] }) }))),
      cards, empty: !cards.length, hasCards: cards.length > 0, count: A ? `${dg(cards.length)} مجموعات منشورة` : `${cards.length} published group${cards.length === 1 ? '' : 's'}`, clear: () => set({ q: '', path: 'All', subj: null }),
      sel, isOpen: !!sel, close: () => set({ open: null }),
      week, hours: Array.from({ length: 12 }, (_, i) => { const h = H0 + i; return { label: A ? `${dg(h % 12 || 12)} ${h >= 12 ? 'م' : 'ص'}` : `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`, top: `${i * H}px` }; }),
      agenda: week.filter(d => d.has), today: week[cp.day], selDay: week[s.day], todayItems: week[cp.day].items, noToday: !week[cp.day].items.length, hasToday: week[cp.day].items.length > 0, upcoming, hasUpcoming: upcoming.length > 0,
      isWeek: s.tview === 'week', isAgenda: s.tview === 'agenda', views: [['week', t.week], ['agenda', t.agenda]].map(([k, l]) => ({ label: l, ...chip(s.tview === k), pick: () => set({ tview: k }) })),
      hasClash: !!cx, clashText, legend: mine.map(g => ({ name: tx(g.name), bg: SC[g.c][0], fg: SC[g.c][1] })),
      myReqs, hasReqs: myReqs.length > 0, classes, hasClasses: classes.length > 0, classCount: dg(classes.length), smat: SMAT.map(m => ({ title: tx(m.title), meta: tx(m.meta), kind: tx(m.k) })),
      notes: s.notes.slice(0, 4).map(n => ({ text: tx(n.x), when: tx(n.w), unread: n.u })), unread: dg(s.notes.filter(n => n.u).length), hasUnread: s.notes.some(n => n.u), readAll: () => c.setState(st => ({ notes: st.notes.map(n => ({ ...n, u: false })) })),
      treqs, hasTreqs: treqs.length > 0, noTreqs: !treqs.length, treqCount: dg(treqs.length), focus: treqs[rqI] || null, focusPos: A ? `${dg(rqI + 1)} من ${dg(treqs.length)}` : `${rqI + 1} of ${treqs.length}`, skipReq: () => set({ rqIdx: (rqI + 1) % Math.max(treqs.length, 1) }),
      tToday, hasTToday: tToday.length > 0, noTToday: !tToday.length, tGroups, tStats,
      wz, lesson, admin, su, confirm, hasConfirm: !!confirm,
      toast: s.toast, hasToast: !!s.toast, now: s.now, dateLabel: new Intl.DateTimeFormat(A ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
    };
  }

  function root(c) { return (c.outerRef && c.outerRef.current) || document; }
  function anim(c, sel, kf, o = {}) {
    if (c._rm) return;
    root(c).querySelectorAll(sel).forEach((el, i) => el.animate(kf, { duration: o.duration || 600, easing: o.easing || 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards', delay: (o.stagger || 0) * i + (o.delay || 0), iterations: o.iterations || 1 }));
  }
  function reveal(c) {
    const r = root(c), sc = c.scrollRef && c.scrollRef.current;
    const els = [...r.querySelectorAll('[data-reveal]:not([data-rv])')];
    els.forEach(e => e.setAttribute('data-rv', '1'));
    if (c._rm || !('IntersectionObserver' in window)) return;
    if (!c._io) c._io = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting) return;
      c._io.unobserve(en.target); en.target.style.opacity = '1';
      en.target.animate([{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }], { duration: 850, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }), { root: sc || null, threshold: 0.05 });
    els.forEach(e => { e.style.opacity = '0'; c._io.observe(e); });
    setTimeout(() => els.forEach(e => { e.style.opacity = '1'; }), 4000);
  }
  function entrance(c) {
    anim(c, '[data-screen]', [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 520 });
    anim(c, '[data-hero]', [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], { duration: 900, stagger: 110 });
    anim(c, '[data-heroblock]', [{ opacity: 0, transform: 'translateY(-20px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 720, stagger: 120, delay: 450 });
    anim(c, '[data-rise]', [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { duration: 560, stagger: 60, delay: 80 });
    anim(c, '[data-bar]', [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 800, stagger: 60, delay: 200 });
    anim(c, '[data-block]', [{ opacity: 0, transform: 'translateY(-10px) scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 600, stagger: 70, delay: 150 });
    if (!c._rm) root(c).querySelectorAll('[data-marquee]:not([data-mq])').forEach(el => { el.setAttribute('data-mq', '1'); el.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${c.state.lang === 'ar' ? 50 : -50}%)` }], { duration: +(el.getAttribute('data-marquee') || 40000), iterations: Infinity }); });
    reveal(c);
  }
  function onScroll(c) {
    const sc = c.scrollRef && c.scrollRef.current; if (!sc) return;
    const y = sc.scrollTop, max = Math.max(1, sc.scrollHeight - sc.clientHeight);
    root(c).querySelectorAll('[data-parallax]').forEach(el => { el.style.transform = `translate3d(0, ${y * +el.getAttribute('data-parallax')}px, 0)`; });
    root(c).querySelectorAll('[data-progress]').forEach(el => { el.style.transform = `scaleX(${y / max})`; });
    root(c).querySelectorAll('[data-fade]').forEach(el => { el.style.opacity = String(Math.max(0, 1 - y / +el.getAttribute('data-fade'))); });
  }
  function mount(c) {
    c._rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = () => c.setState({ now: new Intl.DateTimeFormat(c.state.lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date()) });
    tick(); c._iv = setInterval(tick, 30000);
    c._key = e => { if (e.key === 'Escape') c.setState({ open: null, cmd: false, confirm: null }); if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); c.setState({ cmd: !c.state.cmd, cmdQ: '' }); } };
    window.addEventListener('keydown', c._key);
    const o = c.outerRef && c.outerRef.current;
    if (o && 'ResizeObserver' in window) { c._ro = new ResizeObserver(() => { const n = o.clientWidth < 820; if (n !== c.state.narrow) c.setState({ narrow: n }); }); c._ro.observe(o); }
    const sc = c.scrollRef && c.scrollRef.current;
    if (sc) { c._sc = () => onScroll(c); sc.addEventListener('scroll', c._sc, { passive: true }); }
    c.scrollTop = () => { const x = c.scrollRef && c.scrollRef.current; if (x) x.scrollTop = 0; };
    entrance(c);
  }
  function unmount(c) { clearInterval(c._iv); clearTimeout(c._tt); clearTimeout(c._acc); window.removeEventListener('keydown', c._key); if (c._ro) c._ro.disconnect(); if (c._io) c._io.disconnect(); const sc = c.scrollRef && c.scrollRef.current; if (sc && c._sc) sc.removeEventListener('scroll', c._sc); }
  function update(c, ps) {
    const s = c.state, A = s.lang === 'ar';
    if (s.screen !== ps.screen || s.role !== ps.role || s.lang !== ps.lang) { if (s.lang !== ps.lang) root(c).querySelectorAll('[data-mq]').forEach(e => { e.getAnimations().forEach(a => a.cancel()); e.removeAttribute('data-mq'); }); entrance(c); onScroll(c); }
    if (s.open && s.open !== ps.open) {
      anim(c, '[data-drawer]', [{ transform: `translateX(${A ? -100 : 100}%)` }, { transform: 'none' }], { duration: 520 });
      anim(c, '[data-sheet]', [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 520 });
      anim(c, '[data-expand]', [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
      anim(c, '[data-scrim]', [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    }
    if ((s.confirm && !ps.confirm) || (s.cmd && !ps.cmd)) { anim(c, '[data-modal]', [{ opacity: 0, transform: 'translateY(16px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 380 }); anim(c, '[data-scrim]', [{ opacity: 0 }, { opacity: 1 }], { duration: 250 }); }
    if (s.toast && s.toast !== ps.toast) anim(c, '[data-toast]', [{ opacity: 0, transform: 'translateY(18px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
    if (s.path !== ps.path || s.subj !== ps.subj) anim(c, '[data-card]', [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 480, stagger: 55 });
    if (s.day !== ps.day) anim(c, '[data-dayitem]', [{ opacity: 0, transform: `translateX(${A ? -18 : 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, stagger: 70 });
    if (s.tview !== ps.tview) anim(c, '[data-block], [data-dayitem]', [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 480, stagger: 40 });
    if (s.wz.step !== ps.wz.step) anim(c, '[data-step]', [{ opacity: 0, transform: `translateX(${(s.wz.step > ps.wz.step ? 1 : -1) * (A ? -28 : 28)}px)` }, { opacity: 1, transform: 'none' }], { duration: 460 });
    if (s.wz.slots.length > ps.wz.slots.length) anim(c, '[data-slot]:last-of-type', [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 400 });
    if (s.mats.length > ps.mats.length) { const els = root(c).querySelectorAll('[data-mat]'); const el = els[els.length - 1]; if (el && !c._rm) el.animate([{ opacity: 0, transform: 'translateY(12px) scale(.98)', background: 'rgba(255,200,120,.35)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2,.7,.2,1)' }); }
    if (s.aSel !== ps.aSel || s.rqIdx !== ps.rqIdx) anim(c, '[data-detail]', [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 400 });
    if (s.treq !== ps.treq || s.queue !== ps.queue) anim(c, '[data-rise]', [{ opacity: 0.4, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, stagger: 40 });
    Object.keys(s.req).forEach(id => {
      if (s.req[id] === ps.req[id]) return;
      anim(c, `[data-status="${id}"]`, [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
      if (s.req[id] === 'accepted') anim(c, `[data-block="${id}"]`, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 750, stagger: 140 });
    });
  }
  return { initState, build, mount, unmount, update };
})();
