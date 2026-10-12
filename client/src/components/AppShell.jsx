import { useEffect, useState } from "react";
import Sidebar from "./sidebar";

export default function AppShell({ username = "User", className = "", contentClassName = "", children }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("cryptiva-sidebar-collapsed") === "true"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("cryptiva-sidebar-active");
    const closeOnEscape = (event) => { if (event.key === "Escape") setMobileOpen(false); };
    const closeOnDesktop = () => { if (window.innerWidth > 900) setMobileOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      document.body.classList.remove("cryptiva-sidebar-active");
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      try { localStorage.setItem("cryptiva-sidebar-collapsed", String(next)); } catch { /* Storage can be unavailable. */ }
      return next;
    });
  }

  return <div className={`app-shell ${className}${collapsed ? " sidebar-collapsed" : ""}`}>
    <Sidebar username={username} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
    <main className="app-main">
      <header className="app-header">
        <button className="app-menu-button" type="button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="cryptiva-sidebar" onClick={() => setMobileOpen((value) => !value)}><span aria-hidden="true">☰</span></button>
        <a className="app-mobile-brand" href="/react/dashboard"><span aria-hidden="true">🔐</span> CRYPTIVA</a>
        <div className="app-header-account"><span className="app-header-avatar" aria-hidden="true">{String(username || "U").charAt(0).toUpperCase()}</span><span>{username}</span></div>
      </header>
      <section className={`app-content ${contentClassName}`}>{children}</section>
    </main>
    <button className={`sidebar-overlay${mobileOpen ? " active" : ""}`} type="button" aria-label="Close navigation" tabIndex={mobileOpen ? 0 : -1} onClick={() => setMobileOpen(false)} />
  </div>;
}
