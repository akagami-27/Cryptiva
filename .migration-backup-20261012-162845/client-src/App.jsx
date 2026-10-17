import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Files from "./pages/Files.jsx";
import WorkspacePage from "./pages/WorkspacePage.jsx";
export default function App() { return <Routes>
  <Route path="/" element={<Landing />} />
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
