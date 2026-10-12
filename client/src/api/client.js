/** Read the current token at request time; login/session changes can rotate it. */
export function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

let csrfRequest;

/** Retrieve the token attached to the browser's current Express session. */
export function refreshCsrfToken() {
  if (!csrfRequest) {
    csrfRequest = fetch('/csrf-token', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.csrfToken) {
          throw new Error(data.error || 'Unable to initialize secure request.');
        }
        document.querySelector('meta[name="csrf-token"]')?.setAttribute('content', data.csrfToken);
        return data.csrfToken;
      })
      .finally(() => { csrfRequest = undefined; });
  }
  return csrfRequest;
}

export async function ensureCsrfToken() {
  const existing = getCsrfToken();
  if (existing) return existing;
  return refreshCsrfToken();
}

export async function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-CSRF-Token', await ensureCsrfToken());
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'same-origin'
  });

  const contentType = response.headers.get('content-type') || '';
  if (response.redirected || contentType.includes('text/html')) {
    window.location.assign('/react/login');
    throw new Error('Your session may have expired. Please sign in again.');
  }

  return response;
}
