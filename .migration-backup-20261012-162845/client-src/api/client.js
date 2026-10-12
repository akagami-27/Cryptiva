/** Read the current token at request time; login/session changes can rotate it. */
export function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

export async function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-CSRF-Token', getCsrfToken());
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'same-origin'
  });

  const contentType = response.headers.get('content-type') || '';
  if (response.redirected || contentType.includes('text/html')) {
    window.location.assign('/login');
    throw new Error('Your session may have expired. Please sign in again.');
  }

  return response;
}
