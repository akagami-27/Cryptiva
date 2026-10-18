import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Files from "./pages/Files.jsx";
import WorkspacePage from "./pages/WorkspacePage.jsx";
function RootRoute() {
  const [destination, setDestination] = useState(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;

    setDestination(null);
    setError(false);

    fetch("/me", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then((response) => {
        if (response.status === 401) {
          if (active) setUnauthenticated(true);
          return;
        }
        if (!response.ok) throw new Error("Unable to verify your session.");
        if (active) setDestination("/dashboard");
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });

    return () => {
      active = false;
    };
  }, [retry]);

  if (destination) {
    return <Navigate to={destination} replace />;
  }

  if (unauthenticated) return <Landing />;

  if (error) {
    return (
      <main role="alert">
        <h1>Unable to verify your session</h1>
        <p>Please check your connection and try again.</p>
        <button onClick={() => setRetry((value) => value + 1)}>
          Retry
        </button>
        <p>
          <a href="/login">Go to login</a>
        </p>
      </main>
    );
  }

  return (
    <main role="status" aria-live="polite">
      <p>Checking your session…</p>
    </main>
  );
}

function ProtectedRoute({ children }) {
  const location = useLocation();
  const [state, setState] = useState("checking");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/me", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok && response.status !== 401) throw new Error("Unable to verify your session.");
        if (active) setState(response.status === 401 ? "unauthenticated" : "authenticated");
      })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [retry]);

  if (state === "authenticated") return children;
  if (state === "unauthenticated") {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (state === "error") {
    return <main role="alert"><h1>Unable to verify your session</h1><p>Please check your connection and try again.</p><button onClick={() => { setState("checking"); setRetry((value) => value + 1); }}>Retry</button><p><Link to="/">Return to Cryptiva</Link></p></main>;
  }
  return <main role="status" aria-live="polite"><p>Checking your session…</p></main>;
}

function PublicOnlyRoute({ children }) {
  const [state, setState] = useState("checking");
  useEffect(() => {
    let active = true;
    fetch("/me", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok && response.status !== 401) throw new Error("Unable to verify your session.");
        if (active) setState(response.status === 401 ? "public" : "authenticated");
      })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);
  if (state === "authenticated") return <Navigate to="/dashboard" replace />;
  if (state === "public") return children;
  if (state === "error") return <main role="alert"><h1>Unable to verify your session</h1><p>Please refresh the page and try again.</p></main>;
  return <main role="status" aria-live="polite"><p>Checking your session…</p></main>;
}

function NotFound() {
  return <main><h1>Page not found</h1><p>This Cryptiva page does not exist.</p><Link to="/">Return to Cryptiva</Link></main>;
}

function LegacyRouteRedirect() {
  const location = useLocation();
  const destination = location.pathname.replace(/^\/react(?=\/|$)/, "") || "/";
  const knownPages = new Set(["/", "/login", "/register", "/dashboard", "/files", "/shared", "/activity", "/profile", "/security"]);
  if (!knownPages.has(destination)) return <NotFound />;
  return <Navigate to={`${destination}${location.search}`} replace />;
}

export default function App() { return <Routes>
  <Route path="/" element={<RootRoute />} />
  <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
  <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
  <Route path="/files" element={<ProtectedRoute><Files /></ProtectedRoute>} />
  <Route path="/shared" element={<ProtectedRoute><WorkspacePage section="shared" /></ProtectedRoute>} />
  <Route path="/activity" element={<ProtectedRoute><WorkspacePage section="activity" /></ProtectedRoute>} />
  <Route path="/profile" element={<ProtectedRoute><WorkspacePage section="profile" /></ProtectedRoute>} />
  <Route path="/security" element={<ProtectedRoute><WorkspacePage section="security" /></ProtectedRoute>} />
  <Route path="/react/*" element={<LegacyRouteRedirect />} />
  <Route path="*" element={<NotFound />} />
</Routes>; }
