
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'cryptiva-sidebar-collapsed';

const navigation = [
  { label: 'Dashboard', href: '/dashboard', icon: '▦' },
  { label: 'Files', href: '/files', icon: '▤' },
  { label: 'Shared Files', href: '/shared', icon: '♧' },
  { label: 'Activity', href: '/activity', icon: '⌁' },
];

const accountNavigation = [
  { label: 'Profile', href: '/react/profile', icon: '♙' },
  { label: 'Security', href: '/security', icon: '⬡' },
];

function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

function getActivePath(href) {
  const path = window.location.pathname;

  if (href === '/files') return path === '/files' || path.startsWith('/files/');
  if (href === '/shared') return path === '/shared' || path.startsWith('/shared/');
  if (href === '/activity') return path === '/activity' || path.startsWith('/activity/');
  if (href === '/security') return path === '/security' || path.startsWith('/security/');
  if (href === '/dashboard') return path === '/dashboard' || path === '/react/dashboard';
  if (href === '/react/profile') return path === '/react/profile';

  return path === href;
}

function NavLinks({ items, onNavigate }) {
  return items.map((item) => {
    const active = getActivePath(item.href);

    return (
      <a
        key={item.label}
        className={`sidebar-link${active ? ' active' : ''}`}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        title={item.label}
      >
        <span className="sidebar-icon" aria-hidden="true">
          {item.icon}
        </span>
        <span className="sidebar-link-text">{item.label}</span>
      </a>
    );
  });
}

export default function Sidebar() {
  const [username, setUsername] = useState('Loading...');
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add('cryptiva-sidebar-active');

    return () => {
      document.body.classList.remove('cryptiva-sidebar-active');
      document.body.classList.remove('cryptiva-sidebar-collapsed');
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle(
      'cryptiva-sidebar-collapsed',
      collapsed && window.innerWidth > 900
    );

    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // Sidebar still works if storage is unavailable.
    }
  }, [collapsed]);

  useEffect(() => {
    let active = true;

    fetch('/me', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load account');
        return response.json();
      })
      .then((data) => {
        if (active) setUsername(data?.user?.username || 'User');
      })
      .catch(() => {
        if (active) setUsername('User');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 900) setMobileOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <>
      <header className="sidebar-mobile-bar">
        <a className="sidebar-mobile-brand" href="/dashboard">
          <span className="sidebar-mobile-brand-icon">◈</span>
          <span className="sidebar-mobile-brand-text">CRYPTIVA</span>
        </a>

        <button
          className="sidebar-menu-button"
          type="button"
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((value) => !value)}
        >
          {mobileOpen ? '×' : '☰'}
        </button>
      </header>

      <aside
        id="cryptiva-sidebar"
        className={`cryptiva-sidebar${mobileOpen ? ' mobile-open' : ''}`}
      >
        <a className="sidebar-brand" href="/dashboard" aria-label="Cryptiva Dashboard">
          <span className="sidebar-brand-icon">◈</span>
          <span className="sidebar-brand-text">
            <span className="sidebar-brand-name">CRYPTIVA</span>
            <span className="sidebar-brand-subtitle">SECURE VAULT</span>
          </span>
        </a>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Main</div>
          <nav className="sidebar-nav" aria-label="Main navigation">
            <NavLinks items={navigation} onNavigate={closeMobile} />
          </nav>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Account</div>
          <nav className="sidebar-nav" aria-label="Account navigation">
            <NavLinks items={accountNavigation} onNavigate={closeMobile} />
          </nav>
        </div>

        <div className="sidebar-spacer" />

        <div className="sidebar-user">
          <div className="sidebar-user-card">
            <div className="sidebar-user-avatar">
              {username.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{username}</div>
              <div className="sidebar-user-status">
                <span className="sidebar-status-dot" />
                Secure session
              </div>
            </div>
          </div>

          <form action="/logout" method="POST">
            <input type="hidden" name="_csrf" value={getCsrfToken()} />
            <button className="sidebar-logout" type="submit">
              <span className="sidebar-icon" aria-hidden="true">↪</span>
              <span className="sidebar-link-text">Sign out</span>
            </button>
          </form>
        </div>

        <button
          className="sidebar-collapse-button"
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
        </button>
      </aside>

      <div
        className={`sidebar-overlay${mobileOpen ? ' active' : ''}`}
        onClick={closeMobile}
        aria-hidden="true"
      />
    </>
  );
}