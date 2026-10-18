import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell.jsx';
import { apiFetch } from '../api/client.js';
import '../styles/dashboard.css';
import '../styles/workspace.css';

const date = (value) => value ? new Intl.DateTimeFormat('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'â€”';
const bytes = (value = 0) => { const n = Number(value) || 0; return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`; };

function PageFrame({ section, title, subtitle, children }) {
  const [username, setUsername] = useState('User');
  useEffect(() => { let live = true; apiFetch('/me').then(r => r.json()).then(d => live && setUsername(d?.user?.username || 'User')).catch(() => {}); return () => { live = false; }; }, []);
  return <AppShell username={username} className={`dashboard-page ${section}-page`} contentClassName="dashboard-main"><header className="workspace-page-heading"><div><p className="workspace-page-eyebrow">SECURE WORKSPACE</p><h1>{title}</h1><p>{subtitle}</p></div></header>{children}</AppShell>;
}

function Panel({ title, children, actions }) { return <section className="panel"><div className="panel-header"><h2>{title}</h2>{actions}</div>{children}</section>; }
function Notice({ children, error }) { return children ? <div className={error ? 'dashboard-error' : 'workspace-notice'} role={error ? 'alert' : 'status'}>{children}</div> : null; }

function getShareStatus(share, now = Date.now()) {
  if (share.expired || (share.expiresAt && new Date(share.expiresAt).getTime() <= now)) return 'expired';
  if (share.downloadLimitReached) return 'limit-reached';
  if (!share.active) return 'inactive';
  const expiry = share.expiresAt ? new Date(share.expiresAt).getTime() : 0;
  if (expiry > now && expiry - now <= 24 * 60 * 60 * 1000) return 'expiring';
  return 'active';
}

function SharedFiles() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/shared/data');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load shared files.');
      setFiles(Array.isArray(data.files) ? data.files : []);
      setLoadFailed(false);
      setError('');
    } catch (loadError) {
      setLoadFailed(true);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = files.filter(file =>
    (file.originalName || '').toLowerCase().includes(query.trim().toLowerCase())
  );
  const activeCount = files.filter(file => ['active', 'expiring'].includes(getShareStatus(file))).length;
  const expiringCount = files.filter(file => getShareStatus(file) === 'expiring').length;
  const inactiveCount = files.filter(file => file.expired || file.downloadLimitReached).length;
  const downloadsUsed = files.reduce((total, file) => total + (Number(file.downloadCount) || 0), 0);

  async function copyLink(share) {
    setError('');
    setMessage('');
    try {
      if (!share.shareUrl || !navigator.clipboard?.writeText) throw new Error('Copying is unavailable in this browser.');
      await navigator.clipboard.writeText(share.shareUrl);
      setMessage('Secure share link copied to clipboard.');
    } catch (copyError) {
      setError(copyError.message || 'Unable to copy the share link.');
    }
  }

  async function revoke() {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/shared/' + encodeURIComponent(selected.id), { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to revoke link.');
      setFiles(current => current.filter(file => file.id !== selected.id));
      setSelected(null);
      setMessage('Sharing link revoked.');
    } catch (revokeError) {
      setError(revokeError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame section="shared" title="Shared Files" subtitle="Manage the links and access limits you have created.">
      <Notice error>{error}</Notice>
      <header className="shared-page-heading">
        <div>
          <p className="section-kicker">CONTROLLED ACCESS</p>
          <h2>Your shared access</h2>
          <p>Review expiry, download usage and protection for each active or inactive link.</p>
        </div>
        <Link className="primary-button shared-create-link" to="/files">
          <span aria-hidden="true">＋</span> Choose a file to share
        </Link>
      </header>

      <section className="shared-overview" aria-label="Sharing overview">
        <article className="shared-overview-card">
          <span className="shared-overview-icon is-mint" aria-hidden="true">↗</span>
          <div><span>Active shares</span><strong>{loading ? '—' : activeCount}</strong></div>
          <small>Available for access</small>
        </article>
        <article className="shared-overview-card">
          <span className="shared-overview-icon is-amber" aria-hidden="true">◷</span>
          <div><span>Expiring soon</span><strong>{loading ? '—' : expiringCount}</strong></div>
          <small>Within the next 24 hours</small>
        </article>
        <article className="shared-overview-card">
          <span className="shared-overview-icon is-muted" aria-hidden="true">⏸</span>
          <div><span>Unavailable</span><strong>{loading ? '—' : inactiveCount}</strong></div>
          <small>Expired or download limit reached</small>
        </article>
        <article className="shared-overview-card">
          <span className="shared-overview-icon is-violet" aria-hidden="true">↓</span>
          <div><span>Downloads used</span><strong>{loading ? '—' : downloadsUsed}</strong></div>
          <small>Recorded across these links</small>
        </article>
      </section>

      <Panel title="Share links" actions={<button className="secondary-button" onClick={load} disabled={loading}>Refresh</button>}>
        <div className="workspace-toolbar shared-files-toolbar">
          <label className="shared-search-wrap">
            <span className="sr-only">Search shared files</span>
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by filename..." aria-label="Search shared files" />
          </label>
          <span className="shared-result-count">{filtered.length} shown · {files.length} total</span>
        </div>

        {loading ? (
          <div className="shared-loading" role="status"><span className="workspace-spinner" />Loading your share links…</div>
        ) : loadFailed ? (
          <div className="shared-empty">
            <h3>Share links could not be loaded</h3>
            <p>Check your connection and try again.</p>
            <button className="secondary-button" onClick={load}>Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="shared-empty">
            <span className="shared-empty-icon" aria-hidden="true">↗</span>
            <h3>{files.length ? 'No matching links' : 'No shared links yet'}</h3>
            <p>{files.length ? 'Try another filename or clear your search.' : 'Create a link from one of your files and manage its access here.'}</p>
            {files.length ? (
              <button className="secondary-button" onClick={() => setQuery('')}>Clear search</button>
            ) : (
              <Link className="secondary-button" to="/files">Choose a file to share</Link>
            )}
          </div>
        ) : (
          <div className="shared-list">
            {filtered.map(share => {
              const status = getShareStatus(share);
              const statusLabel = {
                active: 'Active',
                expiring: 'Expiring soon',
                expired: 'Expired',
                'limit-reached': 'Limit reached',
                inactive: 'Unavailable'
              }[status];
              return (
                <article className="shared-card" key={share.id}>
                  <div className="shared-card-main">
                    <span className="shared-file-icon" aria-hidden="true">▤</span>
                    <div className="shared-card-title">
                      <h3 title={share.originalName}>{share.originalName || 'Untitled file'}</h3>
                      <p>{bytes(share.size)}{share.category ? ' · ' + share.category : share.extension ? ' · ' + String(share.extension).toUpperCase() : ''}</p>
                    </div>
                    <span className={'share-status share-status-' + status}><span aria-hidden="true" />{statusLabel}</span>
                  </div>
                  <div className="shared-card-details">
                    <div><span>Created</span><strong>{date(share.createdAt)}</strong></div>
                    <div><span>Expires</span><strong>{date(share.expiresAt)}</strong></div>
                    <div><span>Downloads</span><strong>{share.downloadCount || 0} / {share.maxDownloads ?? 'Unlimited'}</strong></div>
                    <div><span>Protection</span><strong>{share.passwordProtected ? 'Password protected' : 'No password'}</strong></div>
                  </div>
                  <div className="shared-card-actions">
                    <button className="secondary-button" onClick={() => copyLink(share)} disabled={!share.shareUrl} aria-label={'Copy link for ' + (share.originalName || 'shared file')}>Copy link</button>
                    <button className="secondary-button danger-button" onClick={() => setSelected(share)} aria-label={'Revoke link for ' + (share.originalName || 'shared file')}>Revoke link</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Notice>{message}</Notice>
      {selected && (
        <div className="workspace-modal-backdrop" role="presentation">
          <section className="workspace-modal shared-revoke-dialog" role="dialog" aria-modal="true" aria-labelledby="shared-revoke-title">
            <span className="shared-revoke-icon" aria-hidden="true">!</span>
            <p className="section-kicker">REVOKE ACCESS</p>
            <h2 id="shared-revoke-title">Revoke this link?</h2>
            <p>This will disable the share link for <strong>{selected.originalName}</strong>.</p>
            <div>
              <button className="secondary-button" onClick={() => setSelected(null)} disabled={busy}>Keep link</button>
              <button className="primary-button danger-button" onClick={revoke} disabled={busy}>{busy ? 'Revoking…' : 'Revoke link'}</button>
            </div>
          </section>
        </div>
      )}
    </PageFrame>
  );
}

const activityActions = [
  'login_success', 'login_failed', 'logout',
  'file_upload', 'file_download', 'file_delete',
  'share_created', 'share_updated', 'share_accessed', 'share_password_failed',
  'share_download', 'share_download_limit_reached', 'share_expired', 'share_revoked',
  'password_changed', 'profile_updated', 'security_event'
];

function activityGroupKey(value) {
  const dateValue = new Date(value);
  if (!Number.isFinite(dateValue.getTime())) return 'unknown';
  return [dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()].join('-');
}

function activityGroupLabel(value) {
  const eventDate = new Date(value);
  if (!Number.isFinite(eventDate.getTime())) return 'Date unavailable';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (activityGroupKey(eventDate) === activityGroupKey(today)) return 'Today';
  if (activityGroupKey(eventDate) === activityGroupKey(yesterday)) return 'Yesterday';
  return eventDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function activityTime(value) {
  const eventDate = new Date(value);
  return Number.isFinite(eventDate.getTime())
    ? eventDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : 'Time unavailable';
}

function activityCategory(action) {
  if (action.startsWith('login') || action === 'logout' || action.includes('password') || action === 'security_event') return 'security';
  if (action.startsWith('share')) return 'sharing';
  return 'files';
}

function Activity() {
  const [state, setState] = useState({ activities: [], total: 0, pages: 1, page: 1, successCount: 0, failedCount: 0 });
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20', search: query, action, status });
      const response = await apiFetch('/activity/data?' + params.toString());
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load activity.');
      setState(data);
      setLoadFailed(false);
      setError('');
    } catch (loadError) {
      setLoadFailed(true);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [query, action, status]);

  useEffect(() => { load(1); }, [load]);

  const groups = [];
  for (const activity of state.activities || []) {
    const key = activityGroupKey(activity.createdAt);
    let group = groups.find(item => item.key === key);
    if (!group) {
      group = { key, label: activityGroupLabel(activity.createdAt), items: [] };
      groups.push(group);
    }
    group.items.push(activity);
  }

  function actionLabel(value) {
    return (value || 'Activity').replaceAll('_', ' ');
  }

  function eventGlyph(activity) {
    const category = activityCategory(activity.action || '');
    return category === 'security' ? '⌑' : category === 'sharing' ? '↗' : '▤';
  }

  return (
    <PageFrame section="activity" title="Activity" subtitle="A chronological record of file, sharing and account events.">
      <Notice error>{error}</Notice>
      <section className="activity-summary" aria-label="Activity summary">
        <article><span className="activity-summary-icon is-violet" aria-hidden="true">◷</span><div><span>Matching events</span><strong>{loading ? '—' : state.total}</strong></div><small>Based on current filters</small></article>
        <article><span className="activity-summary-icon is-mint" aria-hidden="true">✓</span><div><span>Successful</span><strong>{loading ? '—' : state.successCount}</strong></div><small>Recorded successful events</small></article>
        <article><span className="activity-summary-icon is-rose" aria-hidden="true">!</span><div><span>Failed / blocked</span><strong>{loading ? '—' : state.failedCount}</strong></div><small>Failed, blocked or denied</small></article>
      </section>

      <Panel title="Event timeline" actions={<button className="secondary-button" onClick={() => load(state.page)} disabled={loading}>Refresh</button>}>
        <div className="workspace-toolbar activity-toolbar">
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search events, files or descriptions..." aria-label="Search activity" />
          <select value={action} onChange={event => setAction(event.target.value)} aria-label="Filter by event type">
            <option value="">All event types</option>
            {activityActions.map(value => <option key={value} value={value}>{actionLabel(value)}</option>)}
          </select>
          <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter by outcome">
            <option value="">All outcomes</option>
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
            <option value="blocked">Blocked</option>
            <option value="denied">Denied</option>
          </select>
        </div>

        {loading ? (
          <div className="activity-loading" role="status"><span className="workspace-spinner" />Loading activity…</div>
        ) : loadFailed ? (
          <div className="activity-empty">
            <h3>Activity could not be loaded</h3>
            <p>Check your connection and try again.</p>
            <button className="secondary-button" onClick={() => load(state.page)}>Try again</button>
          </div>
        ) : groups.length === 0 ? (
          <div className="activity-empty">
            <span className="activity-empty-icon" aria-hidden="true">◷</span>
            <h3>{query || action || status ? 'No matching activity' : 'No activity recorded yet'}</h3>
            <p>{query || action || status ? 'Try changing your search or filters.' : 'File, sharing and account events will appear here when recorded.'}</p>
            {(query || action || status) && <button className="secondary-button" onClick={() => { setQuery(''); setAction(''); setStatus(''); }}>Clear filters</button>}
          </div>
        ) : (
          <div className="activity-timeline">
            {groups.map(group => (
              <section className="activity-day-group" key={group.key} aria-label={group.label}>
                <h3 className="activity-day-heading">{group.label}</h3>
                <div className="activity-day-list">
                  {group.items.map((activity, index) => {
                    const category = activityCategory(activity.action || '');
                    const outcome = ['failed', 'blocked', 'denied'].includes(activity.status) ? 'failed' : 'success';
                    return (
                      <article className="activity-event" key={activity.id || group.key + '-' + index}>
                        <span className={'activity-event-icon is-' + category} aria-hidden="true">{eventGlyph(activity)}</span>
                        <span className={'activity-event-line ' + (index === group.items.length - 1 ? 'is-last' : '')} aria-hidden="true" />
                        <div className="activity-event-copy">
                          <div className="activity-event-heading">
                            <strong>{actionLabel(activity.action)}</strong>
                            <time dateTime={activity.createdAt || undefined}>{activityTime(activity.createdAt)}</time>
                          </div>
                          <p>{activity.description || 'Account activity recorded.'}</p>
                          {activity.fileName && <span className="activity-resource">File · {activity.fileName}</span>}
                        </div>
                        <span className={'activity-outcome is-' + outcome}>{activity.status || 'Recorded'}</span>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {!loadFailed && <div className="workspace-pagination">
          <span>Page {state.page} of {state.pages} · {state.total} events</span>
          <div>
            <button className="secondary-button" disabled={state.page <= 1 || loading} onClick={() => load(state.page - 1)}>Previous</button>
            <button className="secondary-button" disabled={state.page >= state.pages || loading} onClick={() => load(state.page + 1)}>Next</button>
          </div>
        </div>}
      </Panel>
    </PageFrame>
  );
}
function Profile() {
  const [data, setData] = useState(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/profile/data');
      const profile = await response.json();
      if (!response.ok) throw new Error(profile.error || 'Unable to load profile.');
      setData(profile);
      setUsername(profile.username || '');
      setLoadFailed(false);
      setError('');
    } catch (loadError) {
      setLoadFailed(true);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch('/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to update profile.');
      setMessage(result.message || 'Profile updated successfully.');
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  const displayName = data?.username || username || 'Your account';
  const status = data?.status || 'Unknown';
  const usernameValid = /^[A-Za-z0-9_]{3,20}$/.test(username);

  return (
    <PageFrame section="profile" title="Profile" subtitle="Manage your identity and account details.">
      <Notice error>{error}</Notice>
      {loading ? (
        <div className="workspace-request-state" role="status">Loading your profile…</div>
      ) : loadFailed ? (
        <div className="workspace-request-state" role="alert">
          <h2>Profile details could not be loaded</h2>
          <p>Check your connection and try again.</p>
          <button className="secondary-button" type="button" onClick={load}>Try again</button>
        </div>
      ) : <>
      <section className="profile-overview panel" aria-label="Account overview">
        <div className="profile-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</div>
        <div className="profile-overview-copy">
          <p className="section-kicker">ACCOUNT PROFILE</p>
          <h2>{displayName}</h2>
          <p>Your Cryptiva account and personal workspace identity.</p>
        </div>
        <div className="profile-status-wrap">
          <span className="profile-status-label">Account status</span>
          <span className={'profile-status ' + (status.toLowerCase() === 'active' ? 'is-active' : '')}>
            <span aria-hidden="true" />{status}
          </span>
        </div>
        <div className="profile-member-since">
          <span>Member since</span>
          <strong>{date(data?.createdAt)}</strong>
        </div>
      </section>

      <div className="profile-layout">
        <Panel title="Profile information">
          <p className="workspace-panel-intro">Your username is shown across your Cryptiva workspace.</p>
          <form className="workspace-form profile-form" onSubmit={save}>
            <label htmlFor="profile-username">Username
              <input
                id="profile-username"
                value={username}
                minLength={3}
                maxLength={20}
                pattern="[A-Za-z0-9_]+"
                autoComplete="username"
                aria-invalid={username.length > 0 && !usernameValid}
                aria-describedby="profile-username-hint profile-username-error"
                onChange={event => { setUsername(event.target.value); setError(''); }}
                required
              />
            </label>
            <small id="profile-username-hint">Use 3–20 letters, numbers, or underscores.</small>
            <p className="profile-validation-message" id="profile-username-error" aria-live="polite">
              {username && !usernameValid ? 'Enter 3–20 letters, numbers, or underscores.' : ''}
            </p>
            <button className="primary-button" disabled={busy || !data}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </form>
          <div className="profile-detail-row">
            <span>Last profile update</span>
            <strong>{date(data?.updatedAt)}</strong>
          </div>
        </Panel>

        <section className="profile-security-link panel">
          <span className="profile-security-icon" aria-hidden="true">⌁</span>
          <p className="section-kicker">ACCOUNT PROTECTION</p>
          <h2>Keep your account secure</h2>
          <p>Review recent security activity and update your password from your Security settings.</p>
          <Link className="secondary-button" to="/security">Go to Security <span aria-hidden="true">→</span></Link>
        </section>
      </div>
      </>}
      <Notice>{message}</Notice>
    </PageFrame>
  );
}

const passwordRules = [
  { key: 'length', label: '8 to 128 characters', valid: value => value.length >= 8 && value.length <= 128 },
  { key: 'uppercase', label: 'One uppercase letter', valid: value => /[A-Z]/.test(value) },
  { key: 'lowercase', label: 'One lowercase letter', valid: value => /[a-z]/.test(value) },
  { key: 'number', label: 'One number', valid: value => /[0-9]/.test(value) }
];

function PasswordField({ id, label, value, autoComplete, visible, onToggle, onChange, describedBy, invalid = false }) {
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <span className="password-input-wrap">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          aria-invalid={invalid || undefined}
          minLength={id === 'new-password' || id === 'confirm-password' ? 8 : undefined}
          maxLength={id === 'new-password' || id === 'confirm-password' ? 128 : undefined}
          onChange={onChange}
          aria-describedby={describedBy}
          required
        />
        <button
          className="password-visibility"
          type="button"
          aria-label={visible ? 'Hide ' + label.toLowerCase() : 'Show ' + label.toLowerCase()}
          aria-pressed={visible}
          onClick={onToggle}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </span>
    </div>
  );
}

function Security() {
  const [data, setData] = useState(null);
  const [activityState, setActivityState] = useState('loading');
  const [activityError, setActivityError] = useState('');
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [visible, setVisible] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setActivityState('loading');
    try {
      const response = await apiFetch('/security/data');
      const security = await response.json();
      if (!response.ok) throw new Error(security.error || 'Unable to load security information.');
      setData(security);
      setActivityError('');
      setActivityState('ready');
    } catch (loadError) {
      setActivityError(loadError.message || 'Unable to load security activity.');
      setActivityState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updatePassword(field, value) {
    setForm(current => ({ ...current, [field]: value }));
    setError('');
    setMessage('');
  }

  function toggleVisibility(field) {
    setVisible(current => ({ ...current, [field]: !current[field] }));
  }

  async function change(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (form.newPassword !== form.confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (!passwordRules.every(rule => rule.valid(form.newPassword))) {
      setError('Choose a password that meets all the requirements shown below.');
      return;
    }
    if (form.currentPassword === form.newPassword) {
      setError('Your new password must be different from your current password.');
      return;
    }

    setBusy(true);
    try {
      const response = await apiFetch('/security/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to change password.');
      setMessage(result.message || 'Password changed successfully.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setVisible({ currentPassword: false, newPassword: false, confirmPassword: false });
      await load();
    } catch (changeError) {
      setError(changeError.message);
    } finally {
      setBusy(false);
    }
  }

  const newPasswordMeetsRules = passwordRules.map(rule => rule.valid(form.newPassword));
  const recentActivity = data?.recentSecurityActivity || [];

  return (
    <PageFrame section="security" title="Security" subtitle="Manage your password and review recent security activity.">
      <Notice error>{error}</Notice>

      <section className="security-intro panel">
        <div className="security-aura" aria-hidden="true"><span>✦</span></div>
        <div>
          <p className="section-kicker">SECURITY CENTER</p>
          <h2>Your account protection</h2>
          <p>Use a unique password and keep an eye on important security events.</p>
        </div>
        <div className="security-intro-badge">Password &amp; activity</div>
      </section>

      <section className="security-password-panel panel">
        <div className="panel-header">
          <div>
            <p className="section-kicker">CREDENTIALS</p>
            <h2>Change password</h2>
          </div>
          <span className="security-lock-mark" aria-hidden="true">⌑</span>
        </div>
        <div className="security-password-layout">
          <aside className="security-password-info">
            <span className="security-info-icon" aria-hidden="true">✧</span>
            <h3>Choose a strong password</h3>
            <p>Changing your password helps protect access to your encrypted workspace.</p>
            <ul className="password-rules" aria-label="Password requirements">
              {passwordRules.map((rule, index) => {
                const isActive = form.newPassword.length > 0;
                const isValid = newPasswordMeetsRules[index];
                return (
                  <li className={isActive && isValid ? 'is-valid' : ''} key={rule.key}>
                    <span aria-hidden="true">{isActive && isValid ? '✓' : '○'}</span>{rule.label}
                  </li>
                );
              })}
            </ul>
            <small>Use a password you do not use on other websites.</small>
          </aside>

          <form className="workspace-form security-form" onSubmit={change}>
            <PasswordField
              id="current-password"
              label="Current password"
              value={form.currentPassword}
              autoComplete="current-password"
              visible={visible.currentPassword}
              onToggle={() => toggleVisibility('currentPassword')}
              onChange={event => updatePassword('currentPassword', event.target.value)}
            />
            <PasswordField
              id="new-password"
              label="New password"
              value={form.newPassword}
              autoComplete="new-password"
              visible={visible.newPassword}
              onToggle={() => toggleVisibility('newPassword')}
              onChange={event => updatePassword('newPassword', event.target.value)}
              describedBy="password-requirements"
              invalid={Boolean(form.newPassword && !passwordRules.every(rule => rule.valid(form.newPassword)))}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={form.confirmPassword}
              autoComplete="new-password"
              visible={visible.confirmPassword}
              onToggle={() => toggleVisibility('confirmPassword')}
              onChange={event => updatePassword('confirmPassword', event.target.value)}
              describedBy="confirm-password-error"
              invalid={Boolean(form.confirmPassword && form.newPassword !== form.confirmPassword)}
            />
            <p className="password-confirmation-error" id="confirm-password-error" aria-live="polite">
              {form.confirmPassword && form.newPassword !== form.confirmPassword ? 'Passwords do not match yet.' : ''}
            </p>
            <p className="password-sr-only" id="password-requirements">Password must be 8 to 128 characters, include an uppercase letter, a lowercase letter, and a number.</p>
            <button className="primary-button security-submit" disabled={busy}>
              {busy ? 'Updating password…' : 'Update password'}
            </button>
            <p className="security-form-note">Your password is used for verification and is not included in activity history.</p>
          </form>
        </div>
      </section>

      <Notice>{message}</Notice>
      <Panel title="Recent security activity">
        {activityState === 'loading' ? <div className="activity-loading" role="status"><span className="workspace-spinner" />Loading security activity…</div> : activityState === 'error' ? (
          <div className="workspace-empty" role="alert">
            <p>{activityError || 'Security activity could not be loaded.'}</p>
            <button className="secondary-button" type="button" onClick={load}>Try again</button>
          </div>
        ) : recentActivity.length === 0 ? (
          <div className="workspace-empty">No recent security activity.</div>
        ) : (
          <div className="workspace-activity-list">
            {recentActivity.map(activity => (
              <article key={activity.id}>
                <span className={'activity-status ' + (activity.status === 'failed' ? 'failed' : '')} />
                <div>
                  <strong>{(activity.action || 'Security event').replaceAll('_', ' ')}</strong>
                  <p>{activity.description || 'Account security activity'}</p>
                  <small>{date(activity.createdAt)}</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </PageFrame>
  );
}
export default function WorkspacePage({ section }) { return ({ shared: <SharedFiles/>, activity: <Activity/>, profile: <Profile/>, security: <Security/> })[section] || <PageFrame title="Workspace"><p>Page unavailable.</p><Link to="/dashboard">Dashboard</Link></PageFrame>; }

