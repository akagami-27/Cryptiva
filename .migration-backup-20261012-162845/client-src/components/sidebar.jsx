import { NavLink, useNavigate } from "react-router-dom";
import { apiFetch, getCsrfToken } from "../api/client";

const links = [
  { label: "Dashboard", icon: "▦", path: "/react/dashboard" },
  { label: "Files", icon: "▤", path: "/react/files" },
  { label: "Shared Files", icon: "↗", path: "/react/shared" },
  { label: "Activity", icon: "◷", path: "/react/activity" },
  { label: "Profile", icon: "◉", path: "/react/profile" },
  { label: "Security", icon: "⛨", path: "/react/security" },
];

export default function Sidebar({ username = "User" }) {
  const navigate = useNavigate();
  async function logout() {
    try {
      const response = await fetch('/csrf-token', { credentials: 'same-origin', cache: 'no-store' });
      const data = response.ok ? await response.json() : {};
      const token = data.csrfToken || getCsrfToken();
      const result = await fetch('/logout', { method: 'POST', credentials: 'same-origin', headers: token ? { 'X-CSRF-Token': token } : {} });
      if (!result.ok && !result.redirected) throw new Error('Logout failed');
    } catch (error) {
      console.error(error);
    } finally {
      window.location.assign('/react/login');
    }
  }
  return <aside className="cryptiva-sidebar">
    <NavLink to="/react/dashboard" className="sidebar-brand"><span className="sidebar-brand-icon">🔐</span><span>CRYPTIVA</span></NavLink>
    <div className="sidebar-section-label">WORKSPACE</div>
    <nav className="sidebar-nav">{links.map((link) => <NavLink key={link.path} to={link.path} className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}><span className="sidebar-icon">{link.icon}</span><span>{link.label}</span></NavLink>)}</nav>
    <div className="sidebar-bottom"><div className="sidebar-user"><div className="sidebar-avatar">{String(username || 'U').charAt(0).toUpperCase()}</div><div className="sidebar-user-info"><strong>{username}</strong><span>Secure account</span></div></div><button className="sidebar-logout" onClick={logout}><span>↪</span> Sign out</button></div>
  </aside>;
}
