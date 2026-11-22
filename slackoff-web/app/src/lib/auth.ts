import { supabase } from './storage';

// Supabase Auth only knows emails/phones, so a username is mapped to a placeholder address nobody receives
// mail at: "kale" -> "kale@users.slackoff.local". Users only ever see and type the username.
// Requires "Confirm email" to be OFF in Supabase (Authentication -> Sign In / Providers -> Email),
// otherwise sign-up waits for a confirmation email that can never arrive.
// Override with VITE_AUTH_EMAIL_DOMAIN if Supabase rejects this domain as invalid.
const DOMAIN = import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'users.slackoff.local';

export const USERNAME_RULE = '3–20 characters: letters, numbers, _ or -';
const VALID = /^[a-z0-9_-]{3,20}$/;

export const normalizeUsername = (u: string) => u.trim().toLowerCase();
const toEmail = (u: string) => `${normalizeUsername(u)}@${DOMAIN}`;

/** The login username behind an account (the part before the placeholder domain). */
export const usernameFromEmail = (email: string | null | undefined) =>
  email?.endsWith(`@${DOMAIN}`) ? email.slice(0, -DOMAIN.length - 1) : email ?? null;

/** Turns Supabase's email-centric errors into username wording. */
function explain(err: { message: string; code?: string }): Error {
  const m = err.message.toLowerCase();
  if (err.code === 'invalid_credentials' || m.includes('invalid login credentials')) return new Error('Wrong username or password.');
  if (err.code === 'user_already_exists' || m.includes('already registered')) return new Error('That username is taken.');
  if (err.code === 'email_not_confirmed' || m.includes('not confirmed'))
    return new Error('This account is waiting on email confirmation. Turn off "Confirm email" in Supabase Auth settings.');
  if (err.code === 'email_address_invalid' || (m.includes('email') && m.includes('invalid')))
    return new Error(`Supabase rejected the login domain "${DOMAIN}". Set VITE_AUTH_EMAIL_DOMAIN to another domain.`);
  return new Error(err.message);
}

export async function signInWithUsername(username: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
  if (error) throw explain(error);
}

export async function signUpWithUsername(username: string, password: string) {
  const u = normalizeUsername(username);
  if (!VALID.test(u)) throw new Error(`Username must be ${USERNAME_RULE}.`);
  // The display name (shown on the leaderboard, editable in Settings) starts out as the username.
  const { data, error } = await supabase.auth.signUp({ email: toEmail(u), password, options: { data: { username: u } } });
  if (error) throw explain(error);
  if (!data.session) {
    throw new Error('Account created, but Supabase is waiting on email confirmation. Turn off "Confirm email" in Supabase Auth settings, then delete this user and sign up again.');
  }
}
