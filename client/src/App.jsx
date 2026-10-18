import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiFetch } from "./api/client.js";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Files from "./pages/Files.jsx";
import WorkspacePage from "./pages/WorkspacePage.jsx";
function RootRoute() {
  const [destination, setDestination] = useState(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;

    setDestination(null);
    setError(false);

    apiFetch("/me")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to verify your session.");
        }

        await response.json();

        if (active) {
          setDestination("/dashboard");
        }
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

export default function App() { return <Routes>
  <Route path="/" element={<RootRoute />} />
  <Route path="/login" element={<Login />} />
  <Route path="/register" element={<Register />} />
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/files" element={<Files />} />
  <Route path="/shared" element={<WorkspacePage section="shared" />} />
  <Route path="/activity" element={<WorkspacePage section="activity" />} />
  <Route path="/profile" element={<WorkspacePage section="profile" />} />
  <Route path="/security" element={<WorkspacePage section="security" />} />
  <Route path="*" element={<Navigate to="/dashboard" replace />} />
</Routes>; }
