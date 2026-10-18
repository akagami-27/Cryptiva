import { useState } from 'react';

export default function PasswordField({ id, name, autoComplete, ...inputProps }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-password-control">
      <input
        {...inputProps}
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
      />
      <button
        className="auth-password-toggle"
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" /><path d="M9.9 5.2A10.7 10.7 0 0112 5c5.2 0 9 4.6 10 7-.3.8-1.2 2.2-2.6 3.5M6.2 6.2C3.8 7.6 2.4 10 2 12c1 2.4 4.8 7 10 7 1.1 0 2.1-.2 3-.5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
    </div>
  );
}
