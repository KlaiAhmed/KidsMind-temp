import type { LocaleSlice } from '../../../locales/types';

export const ar = {
  gs_illustration_tagline: 'حيث كل سؤال يضيء مغامرة جديدة',
  login_page_title: 'مرحباً بعودتك',
  login_page_subtitle: 'سجّل الدخول إلى حسابك كولي أمر',
  login_email_label: 'البريد الإلكتروني',
  login_email_placeholder: 'you@example.com',
  login_password_label: 'كلمة المرور',
  login_password_placeholder: 'أدخل كلمة المرور',
  login_forgot_password: 'نسيت كلمة المرور؟',
  login_submit_button: 'تسجيل الدخول',
  login_no_account: 'ليس لديك حساب؟',
  login_start_link: 'ابدأ مجاناً',
  login_error_invalid: 'بريد إلكتروني أو كلمة مرور غير صحيحة',
  login_error_session: 'فشل التحقق من الجلسة. حدّث الصفحة ثم حاول مرة أخرى.',
  login_error_network: 'تعذر الوصول إلى الخادم. تحقق من اتصالك وحاول مرة أخرى.',
  login_error_locked: 'الحساب مقفل مؤقتاً بسبب محاولات تسجيل دخول فاشلة متعددة. يرجى المحاولة لاحقاً.',
  login_loading: 'جاري تسجيل الدخول...',
} as const satisfies LocaleSlice;
