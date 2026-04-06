import type { LocaleSlice } from '../../../locales/types';

export const it = {
  gs_illustration_tagline: 'Dove ogni domanda accende una nuova avventura',
  login_page_title: 'Bentornato',
  login_page_subtitle: 'Accedi al tuo account genitore',
  login_email_label: 'Indirizzo e-mail',
  login_email_placeholder: 'tu@esempio.com',
  login_password_label: 'Password',
  login_password_placeholder: 'Inserisci la tua password',
  login_forgot_password: 'Password dimenticata?',
  login_submit_button: 'Accedi',
  login_no_account: 'Non hai un account?',
  login_start_link: 'Inizia gratis',
  login_error_invalid: 'E-mail o password non validi',
  login_error_session: 'La convalida della sessione non è riuscita. Aggiorna la pagina e riprova.',
  login_error_network: 'Impossibile raggiungere il server. Controlla la connessione e riprova.',
  login_error_locked: 'L\'account è temporaneamente bloccato a causa di diversi tentativi di accesso falliti. Riprova più tardi.',
  login_loading: 'Accesso in corso...',
} as const satisfies LocaleSlice;
