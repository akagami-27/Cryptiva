import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame.jsx';
import { refreshCsrfToken } from '../api/client.js';

export default function Login() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const returnTo = params.get('returnTo') || '/dashboard';

  const [csrfToken, setCsrfToken] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    refreshCsrfToken()
      .then((token) => { if (active) setCsrfToken(token); })
      .catch(() => { if (active) setCsrfToken(''); });
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const form = event.currentTarget;
      const body = new URLSearchParams(new FormData(form));
      const token = await refreshCsrfToken();
      body.set('_csrf', token);
      setCsrfToken(token);
      const response = await fetch('/login', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, credentials: 'same-origin', redirect: 'follow' });
      const destination = new URL(response.url, window.location.origin);
      if (response.redirected && destination.pathname === '/dashboard') { window.location.assign(destination.pathname + destination.search); return; }
      if (response.redirected && destination.pathname.startsWith('/files/shared/')) { window.location.assign(destination.pathname); return; }
      setFormError('Unable to sign in with those details. Please check your username and password.');
    } catch { setFormError('Unable to reach the sign-in service. Please try again.'); }
    finally { setSubmitting(false); }
  }

  return (
    <AuthFrame>
      <a className="brand" href="/" aria-label="Cryptiva home">
        <span className="brand-mark">C</span>
        <span>cryptiva</span>
      </a>

      <p className="eyebrow">SECURE FILE SHARING</p>
      <h1>Welcome back</h1>
      <p className="auth-subtitle">
        Sign in to access your secure workspace.
      </p>
      {params.get('registered') === '1' && <p className="auth-success" role="status">Your account is ready. Sign in to continue.</p>}

      <form action="/login" method="POST" className="auth-form" onSubmit={submit}>
        <input type="hidden" name="_csrf" value={csrfToken} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          maxLength={20}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />

        {formError && <p className="auth-error" role="alert">{formError}</p>}
        <button type="submit" className="primary-button" disabled={submitting}>
          Sign in <span aria-hidden="true">→</span>
        </button>
      </form>

      <p className="auth-footer">
        New to Cryptiva? <Link to="/register">Create an account</Link>
      </p>

      <p className="auth-note">
        Your files. Encrypted. In your control.
      </p>
    </AuthFrame>
  );
}
