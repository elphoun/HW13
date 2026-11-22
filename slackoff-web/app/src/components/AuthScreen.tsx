import { useState, type FormEvent } from 'react';
import * as store from '../lib/storage';
import logo from '../assets/home/logo.png';

type Mode = 'sign-in' | 'sign-up' | 'reset';

/** Email + password sign-in / sign-up (Supabase's built-in email provider). */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(store.legacyName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const switchTo = (m: Mode) => { setMode(m); setError(''); setNotice(''); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'sign-in') await store.signIn(email, password);   // onAuthChange takes it from here
      else if (mode === 'sign-up') {
        const needsConfirm = await store.signUp(email, password, name);
        if (needsConfirm) { setNotice(`We sent a confirmation link to ${email}. Click it, then sign in.`); setMode('sign-in'); }
      } else {
        await store.sendPasswordReset(email);
        setNotice(`If ${email} has an account, a password reset link is on its way.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="boot-screen">
      <form className="auth-card" onSubmit={e => void submit(e)}>
        <img src={logo} alt="SlackOff" className="auth-logo" />
        <h2>{mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create your account' : 'Reset your password'}</h2>
        {mode === 'sign-up' && (
          <label className="field">Display name<input value={name} maxLength={18} onChange={e => setName(e.target.value)} placeholder="Shown on the leaderboard" /></label>
        )}
        <label className="field">Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        {mode !== 'reset' && (
          <label className="field">Password
            <input type="password" required minLength={6} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />
          </label>
        )}
        {error && <p className="auth-msg error" role="alert">{error}</p>}
        {notice && <p className="auth-msg" role="status">{notice}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'One moment…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Sign up' : 'Send reset link'}
        </button>
        <p className="muted small">
          {mode === 'sign-in' ? <>New here? <button type="button" className="link-btn" onClick={() => switchTo('sign-up')}>Create an account</button> · <button type="button" className="link-btn" onClick={() => switchTo('reset')}>Forgot password?</button></>
            : <>Have an account? <button type="button" className="link-btn" onClick={() => switchTo('sign-in')}>Sign in</button></>}
        </p>
      </form>
    </div>
  );
}
