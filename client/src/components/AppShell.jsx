import { useEffect, useRef, useState } from "react";
import Sidebar from "./sidebar";
import GlobalSearch from "./GlobalSearch.jsx";

export default function AppShell({ username = "User", className = "", contentClassName = "", children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const wasMobileOpen = useRef(false);

  useEffect(() => {
    try { localStorage.removeItem("cryptiva-sidebar-collapsed"); } catch { /* Storage can be unavailable. */ }
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    const closeOnDesktop = () => { if (window.innerWidth > 900) setMobileOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.querySelector("#cryptiva-sidebar nav a")?.focus();
    } else if (wasMobileOpen.current && window.innerWidth <= 900) {
      menuButtonRef.current?.focus({ preventScroll: true });
    }
    wasMobileOpen.current = mobileOpen;
  }, [mobileOpen]);

  return (
    <div className={`app-shell ${className}`}>
      <Sidebar
        username={username}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <main className="app-main">
        <header className="app-header">
          <button
            ref={menuButtonRef}
            className="app-menu-button"
            type="button"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls="cryptiva-sidebar"
            onClick={() => setMobileOpen((value) => !value)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {mobileOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
          <a className="app-mobile-brand" href="/react/dashboard">
            <img src="/images/cryptiva-logo.png" alt="" /> CRYPTIVA
          </a>
          <GlobalSearch disabled={mobileOpen} />
          <div className="app-header-account">
            <span className="app-header-avatar" aria-hidden="true">{String(username || "U").charAt(0).toUpperCase()}</span>
            <span>{username}</span>
          </div>
        </header>
        <section className={`app-content ${contentClassName}`} inert={mobileOpen}>
          {children}
        </section>
      </main>
      <button
        className={`sidebar-overlay${mobileOpen ? " active" : ""}`}
        type="button"
        aria-label="Close navigation"
        aria-hidden={!mobileOpen}
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />
    </div>
  );
}
