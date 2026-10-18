import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { refreshCsrfToken } from '../api/client.js';

export default function Login() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const returnTo = params.get('returnTo') || '/dashboard';

  const [csrfToken, setCsrfToken] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [loginConfirmed, setLoginConfirmed] = useState(false);
  const [confirmedUsername, setConfirmedUsername] = useState('');

  useEffect(() => {
    let active = true;
    refreshCsrfToken()
      .then((token) => { if (active) setCsrfToken(token); })
      .catch(() => { if (active) setCsrfToken(''); });
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setFormError('');
    setSubmitting(true);
    try {
      const form = event.currentTarget;
      const body = new URLSearchParams(new FormData(form));
      const token = csrfToken || await refreshCsrfToken();
      body.set('_csrf', token);
      setCsrfToken(token);
      setLoginPending(true);
      const response = await fetch('/login', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, credentials: 'same-origin', redirect: 'follow' });
      const destination = new URL(response.url, window.location.origin);
      if (response.redirected && destination.origin === window.location.origin && destination.pathname !== '/login') {
        setConfirmedUsername(String(body.get('username') || ''));
        setLoginConfirmed(true);
        window.setTimeout(() => window.location.assign(destination.pathname + destination.search + destination.hash), 650);
        return;
      }
      setFormError('Unable to sign in with those details. Please check your username and password.');
    } catch { setFormError('Unable to reach the sign-in service. Please try again.'); }
    finally { setLoginPending(false); setSubmitting(false); }
  }

  return (
    <AuthFrame>
      <a className="brand" href="/" aria-label="Cryptiva home">
        <img className="brand-logo" src="/images/cryptiva-logo.png" alt="" />
        <span>cryptiva</span>
      </a>

      <p className="eyebrow">YOUR PRIVATE WORKSPACE</p>
      {!loginConfirmed && <>
        <h1>Welcome back</h1>
        <p className="auth-subtitle">Sign in with your Cryptiva username to access your secure files.</p>
        {params.get('registered') === '1' && <p className="auth-success" role="status">Your account is ready. Sign in to continue.</p>}
      </>}

      {loginConfirmed ? (
        <section className="auth-confirmation" role="status" aria-live="polite">
          <div className="auth-confirmation-icon" aria-hidden="true">
            <svg className="auth-account-icon" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="23" />
              <circle cx="24" cy="19" r="7" />
              <path d="M10.5 39c1.8-7 6.4-10.5 13.5-10.5S35.7 32 37.5 39" />
            </svg>
            <svg className="auth-check-icon" viewBox="0 0 24 24" fill="none">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1>Welcome back, {confirmedUsername}</h1>
          <p>Your secure workspace is ready. Redirecting…</p>
        </section>
      ) : <form action="/login" method="POST" className="auth-form" onSubmit={submit}>
        <input type="hidden" name="_csrf" value={csrfToken} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          maxLength={20}
          placeholder="Your username"
          autoCapitalize="none"
          spellCheck="false"
        />

        <label htmlFor="password">Password</label>
        <PasswordField
          id="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="Enter your password"
        />

        {formError && <p className="auth-error" role="alert">{formError}</p>}
        {loginPending && <div className="auth-login-progress" role="status" aria-live="polite">
          <span className="auth-progress-ring" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <circle className="auth-progress-track" cx="24" cy="24" r="22" />
              <circle className="auth-progress-arc" cx="24" cy="24" r="22" />
            </svg>
            <svg className="auth-progress-account" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M4.5 20c.8-4.1 3.3-6.2 7.5-6.2s6.7 2.1 7.5 6.2" />
            </svg>
          </span>
          <span>Verifying your account…</span>
        </div>}
        <button type="submit" className="primary-button" disabled={submitting} aria-busy={submitting}>
          {submitting ? <><span className="auth-spinner" aria-hidden="true" /> Signing in…</> : <>Sign in <span aria-hidden="true">→</span></>}
        </button>
      </form>}

      {!loginConfirmed && <p className="auth-footer">
        New to Cryptiva? <Link to="/register">Create an account</Link>
      </p>}

      {!loginConfirmed && <p className="auth-note">
        Your files. Encrypted. In your control.
      </p>}
    </AuthFrame>
  );
}
