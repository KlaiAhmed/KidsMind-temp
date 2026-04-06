import type { LocaleSlice } from '../../../locales/types';

export const zh = {
  gs_illustration_tagline: '每个问题都能点亮新的冒险',
  login_page_title: '欢迎回来',
  login_page_subtitle: '登录您的家长账户',
  login_email_label: '电子邮箱',
  login_email_placeholder: 'you@example.com',
  login_password_label: '密码',
  login_password_placeholder: '输入您的密码',
  login_forgot_password: '忘记密码？',
  login_submit_button: '登录',
  login_no_account: '还没有账户？',
  login_start_link: '免费注册',
  login_error_invalid: '邮箱或密码无效',
  login_error_session: '会话校验失败。请刷新页面后重试。',
  login_error_network: '无法连接到服务器。请检查网络后重试。',
  login_error_locked: '由于多次登录失败，账户已被暂时锁定。请稍后再试。',
  login_loading: '正在登录...',
} as const satisfies LocaleSlice;
