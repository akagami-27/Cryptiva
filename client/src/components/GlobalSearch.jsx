import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client.js';

const routes = {
  file: '/react/files',
  share: '/react/shared',
  activity: '/react/activity'
};

function formatBytes(value = 0) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '';
  return new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function resultDetail(result) {
  if (result.type === 'file') return [formatBytes(result.size), formatDate(result.createdAt)].filter(Boolean).join(' · ');
  if (result.type === 'share') return ['Share link', formatDate(result.createdAt)].filter(Boolean).join(' · ');
  return [result.fileName, result.detail, formatDate(result.createdAt)].filter(Boolean).join(' · ');
}

export default function GlobalSearch({ disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const resultRefs = useRef([]);
  const requestRef = useRef(null);

  const closeSearch = useCallback((restoreFocus = false) => {
    requestRef.current?.abort();
    requestRef.current = null;
    setOpen(false);
    setQuery('');
    setSubmittedQuery('');
    setResults([]);
    setStatus('idle');
    setError('');
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const runSearch = useCallback(async (rawQuery) => {
    const value = rawQuery.trim();
    setQuery(rawQuery);
    setSubmittedQuery(value);
    setResults([]);
    setError('');

    if (value.length < 2 || value.length > 80) {
      setStatus('invalid');
      setError('Enter between 2 and 80 characters to search.');
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus('loading');

    try {
      const response = await apiFetch(`/search?q=${encodeURIComponent(value)}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to search records.');
      setResults(Array.isArray(data.results) ? data.results : []);
      setStatus('success');
    } catch (searchError) {
      if (searchError.name === 'AbortError') return;
      setError(searchError.message || 'Unable to search records.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (disabled && open) closeSearch(false);
  }, [disabled, open, closeSearch]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) closeSearch(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeSearch(true);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, closeSearch]);

  useEffect(() => () => requestRef.current?.abort(), []);

  function handleInputKeyDown(event) {
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      resultRefs.current[0]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      resultRefs.current[results.length - 1]?.focus();
    }
  }

  function handleResultKeyDown(event, index) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      (resultRefs.current[index + 1] || inputRef.current)?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      (resultRefs.current[index - 1] || inputRef.current)?.focus();
    }
  }

  return (
    <div
      className="global-search-root"
      ref={rootRef}
      onBlur={(event) => {
        if (event.relatedTarget && !rootRef.current?.contains(event.relatedTarget)) closeSearch(false);
      }}
    >
      <button
        ref={triggerRef}
        className="global-search-trigger"
        type="button"
        aria-label={open ? 'Close global search' : 'Open global search'}
        aria-expanded={open}
        aria-controls="global-search-panel"
        disabled={disabled}
        onClick={() => {
          if (open) closeSearch(true);
          else setOpen(true);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
        <span>Search</span>
      </button>

      {open && (
        <section id="global-search-panel" className="global-search-panel" aria-label="Global search">
          <form role="search" onSubmit={(event) => { event.preventDefault(); runSearch(query); }}>
            <label className="sr-only" htmlFor="global-search-input">Search your files, share links, and activity</label>
            <div className="global-search-input-row">
              <input
                ref={inputRef}
                id="global-search-input"
                type="search"
                value={query}
                maxLength={80}
                aria-describedby="global-search-help"
                placeholder="Search files, shares, activity…"
                onChange={(event) => {
                  requestRef.current?.abort();
                  requestRef.current = null;
                  setQuery(event.target.value);
                  setSubmittedQuery('');
                  setResults([]);
                  setStatus('idle');
                  setError('');
                }}
                onKeyDown={handleInputKeyDown}
              />
              <button className="global-search-submit" type="submit" disabled={status === 'loading'}>Search</button>
            </div>
            <p className="global-search-help" id="global-search-help">Searches your files, non-revoked share links, and your activity.</p>
          </form>

          <div className="global-search-state" aria-live="polite">
            {status === 'idle' && <span>Enter at least 2 characters.</span>}
            {status === 'invalid' && <span role="alert">{error}</span>}
            {status === 'loading' && <span role="status">Searching…</span>}
            {status === 'error' && (
              <div className="global-search-error" role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => runSearch(submittedQuery)}>Try again</button>
              </div>
            )}
            {status === 'success' && results.length === 0 && <span>No matching records found.</span>}
            {status === 'success' && results.length > 0 && (
              <ul className="global-search-results" aria-label="Search results">
                {results.map((result, index) => (
                  <li key={`${result.type}:${result.id}`}>
                    <Link
                      ref={(element) => { resultRefs.current[index] = element; }}
                      to={routes[result.type] || '/react/dashboard'}
                      onKeyDown={(event) => handleResultKeyDown(event, index)}
                      onClick={() => closeSearch(false)}
                    >
                      <span className={`global-search-result-icon is-${result.type}`} aria-hidden="true">
                        {result.type === 'file' ? '▤' : result.type === 'share' ? '↗' : '◷'}
                      </span>
                      <span className="global-search-result-copy">
                        <strong>{result.title}</strong>
                        <small>{resultDetail(result)}</small>
                      </span>
                      <span className="global-search-result-type">{result.type}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
