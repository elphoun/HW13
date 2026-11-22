import { useState, type FormEvent } from 'react';
import { USERNAME_RULE, signInWithUsername, signUpWithUsername } from '../lib/auth';

/** Username + password sign-in. Your data lives in Supabase, so you need an account to use the app. */
export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      // On success, AppProvider's auth listener picks up the new session and loads the app.
      if (mode === 'signin') await signInWithUsername(username, password);
      else await signUpWithUsername(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-screen">
      <form className="card auth-card" onSubmit={submit}>
        <h1>SlackOff</h1>
        <p className="muted">{mode === 'signin' ? 'Sign in to pick up where you left off.' : 'Create an account to save your progress.'}</p>
        <label className="field">Username
          <input value={username} onChange={e => setUsername(e.target.value)} required maxLength={20}
            autoComplete="username" autoCapitalize="none" spellCheck={false} />
          {mode === 'signup' && <small>{USERNAME_RULE}. You can set a display name later in Settings.</small>}
        </label>
        <label className="field">Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} /></label>
        {error && <p className="auth-error small">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        <button className="btn ghost" type="button" onClick={() => { setMode(m => (m === 'signin' ? 'signup' : 'signin')); setError(null); }}>
          {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}

/** Shown while the session/data loads, or if loading fails. */
export function LoadingScreen({ error, onRetry, onSignOut }: { error?: string | null; onRetry?: () => void; onSignOut?: () => void }) {
  return (
    <div className="auth-screen">
      <div className="card auth-card">
        <h1>SlackOff</h1>
        {error ? <>
          <p className="auth-error small">Couldn't load your data: {error}</p>
          {onRetry && <button className="btn primary" onClick={onRetry}>Try again</button>}
          {onSignOut && <button className="btn ghost" onClick={onSignOut}>Sign out</button>}
        </> : <p className="muted">Loading…</p>}
      </div>
    </div>
  );
}
