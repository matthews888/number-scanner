'use client';
import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase';
type AuthMode = 'signin' | 'signup';
export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    const credentials = { email: email.trim(), password };
    const { data, error } =
      mode === 'signup'
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);
    if (error) setMessage(error.message);
    else if (mode === 'signup' && !data.session)
      setMessage('Account created. Check your email to confirm your address, then sign in.');
    setBusy(false);
  }
  return (
    <main className="authPage">
      <section className="authCard">
        <div className="authBrand">
          <span>↗</span> NumberScan
        </div>
        <h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
        <p>
          {mode === 'signin'
            ? 'Sign in to open your number scanner.'
            : 'Create an account to use NumberScan.'}
        </p>
        <form onSubmit={submit} className="authForm">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>
          {message && <div className="authMessage">{message}</div>}
          <button className="primary authSubmit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button
          className="authSwitch"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setMessage('');
          }}
        >
          {mode === 'signin'
            ? 'Need an account? Create account'
            : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  );
}
