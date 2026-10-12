import { NavLink } from "react-router-dom";
import { getCsrfToken } from "../api/client";

const links = [
  { label: "Dashboard", icon: "▦", path: "/react/dashboard" },
  { label: "Files", icon: "▤", path: "/react/files" },
  { label: "Shared Files", icon: "↗", path: "/react/shared" },
  { label: "Activity", icon: "◷", path: "/react/activity" },
  { label: "Profile", icon: "◉", path: "/react/profile" },
  { label: "Security", icon: "⬡", path: "/react/security" },
];

export default function Sidebar({ username = "User", collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }) {
  async function logout() {
    try {
      const response = await fetch("/csrf-token", { credentials: "same-origin", cache: "no-store" });
      const data = response.ok ? await response.json() : {};
      const token = data.csrfToken || getCsrfToken();
      const result = await fetch("/logout", { method: "POST", credentials: "same-origin", headers: token ? { "X-CSRF-Token": token } : {} });
      if (!result.ok && !result.redirected) throw new Error("Logout failed");
    } catch (error) { console.error(error); }
    finally { window.location.assign("/react/login"); }
  }

  return <aside id="cryptiva-sidebar" className={`cryptiva-sidebar${collapsed ? " is-collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
    <NavLink to="/react/dashboard" className="sidebar-brand" onClick={onCloseMobile} aria-label="Cryptiva dashboard">
      <span className="sidebar-brand-icon" aria-hidden="true">🔐</span><span className="sidebar-brand-name">CRYPTIVA</span>
    </NavLink>
    <div className="sidebar-section-label">WORKSPACE</div>
    <nav className="sidebar-nav" aria-label="Workspace navigation">
      {links.map((link) => <NavLink key={link.path} to={link.path} onClick={onCloseMobile} title={collapsed ? link.label : undefined} aria-label={link.label} className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <span className="sidebar-icon" aria-hidden="true">{link.icon}</span><span className="sidebar-link-text">{link.label}</span>
      </NavLink>)}
    </nav>
    <div className="sidebar-spacer" />
    <button className="sidebar-collapse-button" type="button" onClick={onToggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}><span aria-hidden="true">{collapsed ? "›" : "‹"}</span><span className="sidebar-link-text">Collapse</span></button>
    <div className="sidebar-bottom">
      <div className="sidebar-user"><div className="sidebar-avatar" aria-hidden="true">{String(username || "U").charAt(0).toUpperCase()}</div><div className="sidebar-user-info"><strong title={username}>{username}</strong><span>Secure account</span></div></div>
      <button className="sidebar-logout" type="button" onClick={logout} title={collapsed ? "Sign out" : undefined}><span className="sidebar-icon" aria-hidden="true">↪</span><span className="sidebar-link-text">Sign out</span></button>
    </div>
  </aside>;
}
