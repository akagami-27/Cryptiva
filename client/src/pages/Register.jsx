
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame.jsx';
import { refreshCsrfToken } from '../api/client.js';

export default function Register() {
  const navigate = useNavigate();
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
      const response = await fetch('/register', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, credentials: 'same-origin', redirect: 'follow' });
      const destination = new URL(response.url, window.location.origin);
      if (response.redirected && destination.pathname === '/login') { navigate('/react/login?registered=1'); return; }
      setFormError('Unable to create the account. Check the details and try again.');
    } catch { setFormError('Unable to reach the registration service. Please try again.'); }
    finally { setSubmitting(false); }
  }

  return (
    <AuthFrame>
      <a className="brand" href="/react" aria-label="Cryptiva home">
        <span className="brand-mark">C</span>
        <span>cryptiva</span>
      </a>

      <p className="eyebrow">GET STARTED</p>
      <h1>Create your account</h1>
      <p className="auth-subtitle">
        A safer place for your important files.
      </p>

      <form action="/register" method="POST" className="auth-form" onSubmit={submit}>
        <input type="hidden" name="_csrf" value={csrfToken} />

        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]+"
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />

        <label htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />

        {formError && <p className="auth-error" role="alert">{formError}</p>}
        <button type="submit" className="primary-button" disabled={submitting}>
          Create account <span aria-hidden="true">→</span>
        </button>
      </form>

      <p className="auth-footer">
        Already registered? <Link to="/react/login">Sign in</Link>
      </p>

      <p className="auth-note">
        Your files. Encrypted. In your control.
      </p>
    </AuthFrame>
  );
}
