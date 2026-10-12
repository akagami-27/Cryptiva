
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame.jsx';

export default function Register() {
  const [csrfToken, setCsrfToken] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/csrf-token', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to initialize secure registration.')))
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

      <p className="eyebrow">GET STARTED</p>
      <h1>Create your account</h1>
      <p className="auth-subtitle">
        A safer place for your important files.
      </p>

      <form action="/register" method="POST" className="auth-form" onSubmit={(event) => { if (!csrfToken) { event.preventDefault(); window.alert("Secure registration is still initializing. Please wait a moment and try again."); } }}>
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

        <button type="submit" className="primary-button">
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
