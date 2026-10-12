import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame.jsx';

export default function Login() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const returnTo = params.get('returnTo') || '/react/dashboard';

  const [csrfToken, setCsrfToken] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/csrf-token', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to initialize secure sign-in.')))
      .then((data) => { if (active) setCsrfToken(data.csrfToken || ''); })
      .catch(() => { if (active) setCsrfToken(''); });
    return () => { active = false; };
  }, []);

  return (
    <AuthFrame>
      <a className="brand" href="/react" aria-label="Cryptiva home">
        <span className="brand-mark">C</span>
        <span>cryptiva</span>
      </a>

      <p className="eyebrow">SECURE FILE SHARING</p>
      <h1>Welcome back</h1>
      <p className="auth-subtitle">
        Sign in to access your secure workspace.
      </p>

      <form action="/login" method="POST" className="auth-form" onSubmit={(event) => { if (!csrfToken) { event.preventDefault(); window.alert("Secure sign-in is still initializing. Please wait a moment and try again."); } }}>
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

        <button type="submit" className="primary-button">
          Sign in <span aria-hidden="true">→</span>
        </button>
      </form>

      <p className="auth-footer">
        New to Cryptiva? <Link to="/react/register">Create an account</Link>
      </p>

      <p className="auth-note">
        Your files. Encrypted. In your control.
      </p>
    </AuthFrame>
  );
}
