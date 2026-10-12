import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Files from "./pages/Files.jsx";
import WorkspacePage from "./pages/WorkspacePage.jsx";
export default function App() { return <Routes>
  <Route path="/" element={<Navigate to="/react" replace />} />
  <Route path="/react" element={<Landing />} />
  <Route path="/react/login" element={<Login />} />
  <Route path="/react/register" element={<Register />} />
  <Route path="/react/dashboard" element={<Dashboard />} />
  <Route path="/react/files" element={<Files />} />
  <Route path="/react/shared" element={<WorkspacePage section="shared" />} />
  <Route path="/react/activity" element={<WorkspacePage section="activity" />} />
  <Route path="/react/profile" element={<WorkspacePage section="profile" />} />
  <Route path="/react/security" element={<WorkspacePage section="security" />} />
  <Route path="*" element={<Navigate to="/react/dashboard" replace />} />
</Routes>; }
