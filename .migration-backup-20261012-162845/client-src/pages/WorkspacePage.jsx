import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/sidebar.jsx';

const config = {
  shared: { title: 'Shared Files', subtitle: 'Manage your secure file-sharing links.', endpoint: '/shared/data', empty: 'No shared files to display.' },
  activity: { title: 'Activity', subtitle: 'Review recent security and file activity on your account.', endpoint: '/activity/data', empty: 'No activity records found.' },
  profile: { title: 'Profile', subtitle: 'View your account information.', endpoint: '/profile/data', empty: 'Profile information is unavailable.' },
  security: { title: 'Security', subtitle: 'Review your account security information.', endpoint: '/security/data', empty: 'Security information is unavailable.' },
};
const nice = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
const titleCase = (value) => String(value).replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (s) => s.toUpperCase());
export default function WorkspacePage({ section }) {
  const cfg = config[section]; const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [username, setUsername] = useState('User'); const navigate = useNavigate();
  useEffect(() => { let alive = true; (async () => { try {
    const me = await fetch('/me', { credentials: 'same-origin', cache: 'no-store' });
    if (me.status === 401 || me.redirected) { window.location.assign('/react/login'); return; }
    if (me.ok) { const j = await me.json(); setUsername(j?.user?.username || j?.username || 'User'); }
    const res = await fetch(cfg.endpoint, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' });
    const ct = res.headers.get('content-type') || ''; if (res.redirected || ct.includes('text/html')) { window.location.assign('/react/login'); return; }
    const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error || body.message || `Could not load ${cfg.title.toLowerCase()} (${res.status}).`);
    if (alive) setData(body);
  } catch (e) { if (alive) setError(e.message || 'Unable to load this page.'); } finally { if (alive) setLoading(false); } })(); return () => { alive = false; }; }, [cfg.endpoint, cfg.title]);
  const items = Array.isArray(data) ? data : Object.entries(data || {}).filter(([k]) => !['success','message'].includes(k));
  return <div className="dashboard-page"><Sidebar username={username}/><main className="dashboard-content"><header className="dashboard-topbar"><div className="topbar-brand"><span className="brand-mark">🔐</span><span>CRYPTIVA</span></div><div className="topbar-user"><div className="user-avatar">{username.charAt(0).toUpperCase()}</div><span>{username}</span></div></header><section className="dashboard-main"><div className="page-heading"><div><p className="eyebrow">SECURE WORKSPACE</p><h1>{cfg.title}</h1><p>{cfg.subtitle}</p></div></div>{error && <div className="alert alert-error" role="alert">{error}</div>}{loading ? <div className="panel">Loading {cfg.title.toLowerCase()}…</div> : !error && <div className="panel"><div className="panel-header"><h2>{cfg.title} overview</h2><button className="secondary-button" onClick={() => window.location.reload()}>Refresh</button></div>{items.length === 0 ? <p>{cfg.empty}</p> : Array.isArray(data) ? <div className="table-responsive"><table className="files-table"><thead><tr>{Object.keys(data[0] || {}).map((key) => <th key={key}>{titleCase(key)}</th>)}</tr></thead><tbody>{data.map((row, i) => <tr key={row._id || row.id || i}>{Object.entries(row).map(([key, value]) => <td key={key}>{nice(value)}</td>)}</tr>)}</tbody></table></div> : <dl className="workspace-details">{Object.entries(data || {}).map(([key, value]) => <div key={key}><dt>{titleCase(key)}</dt><dd>{nice(value)}</dd></div>)}</dl>}</div>}</section></main></div>;
}
