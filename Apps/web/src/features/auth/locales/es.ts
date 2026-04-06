import type { LocaleSlice } from '../../../locales/types';

export const es = {
  gs_illustration_tagline: 'Donde cada pregunta enciende una nueva aventura',
  login_page_title: 'Bienvenido de nuevo',
  login_page_subtitle: 'Inicia sesión en tu cuenta de padre',
  login_email_label: 'Correo electrónico',
  login_email_placeholder: 'tu@ejemplo.com',
  login_password_label: 'Contraseña',
  login_password_placeholder: 'Ingresa tu contraseña',
  login_forgot_password: '¿Olvidaste tu contraseña?',
  login_submit_button: 'Iniciar sesión',
  login_no_account: '¿No tienes cuenta?',
  login_start_link: 'Empieza gratis',
  login_error_invalid: 'Correo o contraseña inválidos',
  login_error_session: 'La validación de sesión falló. Actualiza la página e inténtalo de nuevo.',
  login_error_network: 'No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.',
  login_error_locked: 'La cuenta está temporalmente bloqueada debido a múltiples intentos fallidos de inicio de sesión. Por favor, inténtalo más tarde.',
  login_loading: 'Iniciando sesión...',
} as const satisfies LocaleSlice;
