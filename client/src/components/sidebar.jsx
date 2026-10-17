import { NavLink } from "react-router-dom";
import { getCsrfToken } from "../api/client";

const workspaceLinks = [
  { label: "Dashboard", path: "/dashboard", icon: "dashboard" },
  { label: "Files", path: "/files", icon: "files" },
  { label: "Shared Files", path: "/shared", icon: "shared" },
  { label: "Activity", path: "/activity", icon: "activity" },
];

const accountLinks = [
  { label: "Profile", path: "/profile", icon: "profile" },
  { label: "Security", path: "/security", icon: "security" },
];

function NavigationIcon({ name }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    files: <><path d="M5 3.5h9l5 5V20a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" /><path d="M14 3.5v5h5M7 13h8M7 17h8" /></>,
    shared: <><circle cx="7" cy="12" r="3" /><circle cx="17" cy="6" r="3" /><circle cx="17" cy="18" r="3" /><path d="m9.6 10.5 4.8-3M9.6 13.5l4.8 3" /></>,
    activity: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
    profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    security: <><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  };

  return (
    <svg className="sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function NavGroup({ links, label, onCloseMobile }) {
  return (
    <div className="sidebar-group">
      <div className="sidebar-section-label">{label}</div>
      <nav className="sidebar-nav" aria-label={`${label.toLowerCase()} navigation`}>
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            onClick={onCloseMobile}
            aria-label={link.label}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            <NavigationIcon name={link.icon} />
            <span className="sidebar-link-text">{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function Sidebar({
  username = "User",
  mobileOpen = false,
  onCloseMobile = () => {},
}) {
  async function logout() {
    try {
      const response = await fetch("/csrf-token", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = response.ok ? await response.json() : {};
      const token = data.csrfToken || getCsrfToken();
      const result = await fetch("/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: token ? { "X-CSRF-Token": token } : {},
      });
      if (!result.ok && !result.redirected) throw new Error("Logout failed");
    } catch (error) {
      console.error(error);
    } finally {
      window.location.assign("/login");
    }
  }

  const initial = String(username || "U").trim().charAt(0).toUpperCase() || "U";

  return (
    <aside
      id="cryptiva-sidebar"
      className={`cryptiva-sidebar${mobileOpen ? " mobile-open" : ""}`}
      aria-label="Main navigation"
    >
      <NavLink to="/dashboard" className="sidebar-brand" onClick={onCloseMobile} aria-label="Cryptiva dashboard">
        <img className="sidebar-brand-icon" src="/images/cryptiva-logo.png" alt="" />
        <span className="sidebar-brand-name">CRYPTIVA</span>
      </NavLink>

      <NavGroup links={workspaceLinks} label="WORKSPACE" onCloseMobile={onCloseMobile} />
      <NavGroup links={accountLinks} label="ACCOUNT" onCloseMobile={onCloseMobile} />

      <div className="sidebar-spacer" />

      <div className="sidebar-bottom">
        <div className="sidebar-user">
          <div className="sidebar-avatar" aria-hidden="true">{initial}</div>
          <div className="sidebar-user-info">
            <strong title={username}>{username}</strong>
            <span>Cryptiva account</span>
          </div>
        </div>
        <button
          className="sidebar-logout"
          type="button"
          onClick={logout}
        >
          <svg className="sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4m4-4H9" />
          </svg>
          <span className="sidebar-link-text">Sign out</span>
        </button>
      </div>

    </aside>
  );
}
