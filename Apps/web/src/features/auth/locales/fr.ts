import type { LocaleSlice } from '../../../locales/types';

export const fr = {
  gs_illustration_tagline: 'Où chaque question allume une nouvelle aventure',
  login_page_title: 'Bon retour',
  login_page_subtitle: 'Connectez-vous à votre compte parent',
  login_email_label: 'Adresse e-mail',
  login_email_placeholder: 'vous@exemple.com',
  login_password_label: 'Mot de passe',
  login_password_placeholder: 'Entrez votre mot de passe',
  login_forgot_password: 'Mot de passe oublié ?',
  login_submit_button: 'Se connecter',
  login_no_account: 'Pas encore de compte ?',
  login_start_link: 'Commencer gratuitement',
  login_error_invalid: 'E-mail ou mot de passe invalide',
  login_error_session: 'La validation de session a échoué. Actualisez la page puis réessayez.',
  login_error_network: 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.',
  login_error_locked: 'Le compte est temporairement verrouillé suite à plusieurs tentatives de connexion échouées. Veuillez réessayer plus tard.',
  login_loading: 'Connexion en cours...',
} as const satisfies LocaleSlice;
