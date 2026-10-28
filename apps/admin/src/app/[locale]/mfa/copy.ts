export const mfaCopy = {
  ar: {
    brand: 'DarSak',
    enrollTitle: 'إعداد التحقق بخطوتين',
    enrollIntro:
      'يتطلب دخول بوابة الإدارة رمز تحقق من تطبيق مصادقة. امسح الرمز أدناه ثم أدخل الرمز المكوّن من 6 أرقام.',
    steps: [
      'ثبّت تطبيق مصادقة مثل Google Authenticator أو 1Password أو Authy.',
      'امسح رمز QR، أو أدخل المفتاح السري يدوياً.',
      'أدخل الرمز المكوّن من 6 أرقام الذي يظهر في التطبيق.',
    ],
    qrAlt: 'رمز QR لإعداد تطبيق المصادقة',
    secret: 'المفتاح السري (للإدخال اليدوي)',
    verifyTitle: 'التحقق بخطوتين',
    verifyIntro: 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.',
    code: 'رمز التحقق',
    submitEnroll: 'تفعيل ومتابعة',
    submitVerify: 'تحقق',
    badCode: 'الرمز غير صحيح أو انتهت صلاحيته. حاول مرة أخرى.',
    badCodeEnroll:
      'الرمز غير صحيح. أُنشئ رمز QR جديد: احذف الإدخال القديم من التطبيق وامسح الرمز الجديد.',
    unavailable: 'تعذر إكمال الطلب. حاول مرة أخرى لاحقاً.',
    logout: 'تسجيل الخروج',
    lost: 'فقدت الجهاز؟ اطلب من المشغّل إزالة عامل المصادقة من لوحة Supabase.',
  },
  en: {
    brand: 'DarSak',
    enrollTitle: 'Set up two-step verification',
    enrollIntro:
      'The administrator portal requires a code from an authenticator app. Scan the QR code, then enter the 6-digit code.',
    steps: [
      'Install an authenticator app such as Google Authenticator, 1Password or Authy.',
      'Scan the QR code, or type the secret key in manually.',
      'Enter the 6-digit code the app shows.',
    ],
    qrAlt: 'QR code for the authenticator app',
    secret: 'Secret key (for manual entry)',
    verifyTitle: 'Two-step verification',
    verifyIntro: 'Enter the 6-digit code from your authenticator app.',
    code: 'Verification code',
    submitEnroll: 'Turn on and continue',
    submitVerify: 'Verify',
    badCode: 'That code is incorrect or has expired. Try again.',
    badCodeEnroll:
      'That code was incorrect. A new QR code was generated: delete the old entry from your app and scan the new one.',
    unavailable: 'The request could not be completed. Try again later.',
    logout: 'Sign out',
    lost: 'Lost your device? Ask the operator to remove your authenticator factor in the Supabase dashboard.',
  },
};
