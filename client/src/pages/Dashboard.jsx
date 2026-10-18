import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import FileIntegrityDisclosure from "../components/FileIntegrityDisclosure";
import { parseShareLimit } from "../utils/shareLimit";
import "../styles/dashboard.css";

const FileAnalyticsSection = lazy(() => import("../components/analytics/FileAnalyticsSection.jsx"));

const API = {
  me: "/me",
  files: "/files/data",
  upload: "/files/upload",
};

function getCsrfToken() {
  return (
    document.querySelector('meta[name="csrf-token"]')?.content ||
    document.querySelector('input[name="_csrf"]')?.value ||
    ""
  );
}

async function apiRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = (options.method || "GET").toUpperCase();

  headers.set("Accept", "application/json");

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = getCsrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
  });

  if (response.status === 401 || response.status === 403) {
    // Do not redirect on every 403: it may be a CSRF failure.
    if (response.status === 401) {
      window.location.href = "/login";
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Request failed (${response.status})`);
  }

  return data;
}

function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;

  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;

  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function getFileName(file) {
  return file.originalName || file.filename || file.name || "Untitled file";
}

function getFileId(file) {
  return file._id || file.id;
}

function getExtension(name = "") {
  return name.includes(".") ? name.split(".").pop().slice(0, 5).toUpperCase() : "FILE";
}

function getFileType(name = "") {
  const ext = name.split(".").pop().toLowerCase();

  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["mp3", "wav", "ogg", "flac"].includes(ext)) return "audio";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";

  return "other";
}

export default function Dashboard() {
  const [username, setUsername] = useState("User");
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [sharePassword, setSharePassword] = useState("");
  const [shareExpiry, setShareExpiry] = useState("24");
  const [shareLimit, setShareLimit] = useState("1");
  const [sharing, setSharing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef(null);
  const toastTimer = useRef(null);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [me, result] = await Promise.all([
        apiRequest(API.me),
        apiRequest(API.files),
      ]);

      setUsername(me?.user?.username || "User");

      if (Array.isArray(result?.files)) {
        setFiles(result.files);
      } else {
        setFiles([]);
      }

      setError("");
      setLoadFailed(false);
    } catch (err) {
      setError(err.message || "Unable to load your vault.");
      setLoadFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return files;

    return files.filter((file) =>
      getFileName(file).toLowerCase().includes(query)
    );
  }, [files, search]);

  const totalSize = files.reduce(
    (sum, file) => sum + (Number(file.size) || 0),
    0
  );

  // `/files/data` exposes this server-derived flag for each file.
  const sharedCount = files.filter((file) => file.hasActiveShare).length;

  async function handleUpload(selectedFiles) {
    if (!selectedFiles?.length) return;

    let uploadedCount = 0;
    setUploading(true);
    setUploadProgress(0);
    setError("");

    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("files", file);

        const token = getCsrfToken();

        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.open("POST", API.upload);
          xhr.withCredentials = true;
          xhr.setRequestHeader("Accept", "application/json");

          if (token) xhr.setRequestHeader("X-CSRF-Token", token);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              setUploadProgress(Math.round((event.loaded / event.total) * 100));
            }
          };

          xhr.onload = () => {
            let data = {};

            try {
              data = JSON.parse(xhr.responseText);
            } catch {
              // Response may not be JSON.
            }

            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              reject(new Error(data.message || data.error || `Upload failed (${xhr.status})`));
            }
          };

          xhr.onerror = () => reject(new Error("Network error during upload."));
          xhr.onabort = () => reject(new Error("Upload cancelled."));
          xhr.send(formData);
        });
        uploadedCount += 1;
      }

      notify("Upload completed successfully.");
      await loadData();
    } catch (err) {
      const uploadError = err.message || "Upload could not be completed.";
      await loadData();
      setError(uploadedCount > 0
        ? `${uploadedCount} file${uploadedCount === 1 ? " was" : "s were"} uploaded before the batch stopped. ${uploadError}`
        : uploadError);
    } finally {
      setUploading(false);
      setUploadProgress(0);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDownload(file) {
    const id = getFileId(file);
    if (!id) return notify("File ID is missing.", "error");

    try {
      const response = await fetch(
        `/files/download/${encodeURIComponent(id)}`,
        { credentials: "same-origin" }
      );

      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = getFileName(file);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      notify("Download started.");
    } catch (err) {
      notify(err.message || "Download failed.", "error");
    }
  }

  async function handleDelete(file) {
    const id = getFileId(file);
    if (!id) return notify("File ID is missing.", "error");

    if (!window.confirm(`Delete "${getFileName(file)}"? This cannot be undone.`)) {
      return;
    }

    try {
      await apiRequest(`/files/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      setFiles((current) => current.filter((item) => getFileId(item) !== id));
      notify("File deleted.");
    } catch (err) {
      notify(err.message || "Unable to delete file.", "error");
    }
  }

  async function handleShare(event) {
    event.preventDefault();

    if (!shareFile) return;

    if (sharePassword.length < 8 || sharePassword.length > 128) {
      return notify("Password must be 8–128 characters.", "error");
    }

    let maxDownloads;
    try {
      maxDownloads = parseShareLimit(shareLimit);
    } catch (err) {
      return notify(err.message, "error");
    }

    const id = getFileId(shareFile);
    setSharing(true);

    try {
      const result = await apiRequest(
        `/files/share/${encodeURIComponent(id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: sharePassword,
            expiresInHours: Number(shareExpiry),
            maxDownloads,
          }),
        }
      );

      const shareUrl =
        result?.url ||
        result?.shareUrl ||
        (result?.token ? `${window.location.origin}/share/${result.token}` : "");

      if (shareUrl) {
        try {
          await navigator.clipboard.writeText(shareUrl);
          notify("Secure share link created and copied.");
        } catch {
          window.prompt("Copy your secure share link:", shareUrl);
        }
      } else {
        notify(result?.message || "Secure share created.");
      }

      setShareFile(null);
      setSharePassword("");
      await loadData();
    } catch (err) {
      notify(err.message || "Unable to create secure share.", "error");
    } finally {
      setSharing(false);
    }
  }

  function handlePageDragEnter(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    setDragActive(true);
    setDragPosition({ x: event.clientX, y: event.clientY });
  }

  function handlePageDragOver(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = uploading ? "none" : "copy";
    setDragPosition({ x: event.clientX, y: event.clientY });
  }

  function handlePageDragLeave(event) {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
    setDragActive(false);
  }

  function handlePageDrop(event) {
    if (!event.dataTransfer?.files?.length) {
      setDragActive(false);
      return;
    }
    event.preventDefault();
    setDragActive(false);
    if (!uploading) handleUpload(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      className={`dashboard-page${dragActive ? " is-file-dragging" : ""}`}
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      <AppShell username={username} className="dashboard-app-shell" contentClassName="dashboard-main">
          <section className="dashboard-hero">
            <div>
              <div className="hero-badge">
                <span className="hero-dot" />
                YOUR PRIVATE WORKSPACE
              </div>

              <h1>
                Your files, <span>under control.</span>
              </h1>

              <p>Welcome back, {username}. Keep your important files protected, organised and ready to share.</p>
              <div className="hero-assurances" aria-label="Vault features">
                <span><i className="assurance-dot assurance-dot--cyan" />Encrypted storage</span>
                <span><i className="assurance-dot assurance-dot--violet" />Controlled sharing</span>
                <span><i className="assurance-dot assurance-dot--amber" />Integrity checks</span>
              </div>
            </div>

            <button
              className="hero-upload"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <span className="upload-button-icon" aria-hidden="true">＋</span>
              {uploading ? "Uploading…" : "Upload files"}
            </button>
          </section>

          <section className="dashboard-stats">
            <article className="stat-card">
              <div className="stat-heading"><span className="stat-symbol stat-symbol--violet">▤</span><span>Total files</span></div>
              <strong className="accent">{loadFailed && files.length === 0 ? "—" : files.length}</strong>
              <small>Stored in your vault</small>
            </article>

            <article className="stat-card">
              <div className="stat-heading"><span className="stat-symbol stat-symbol--cyan">◫</span><span>Storage used</span></div>
              <strong>{loadFailed && files.length === 0 ? "—" : formatBytes(totalSize)}</strong>
              <small>Across all uploaded files</small>
            </article>

            <article className="stat-card">
              <div className="stat-heading"><span className="stat-symbol stat-symbol--green">↗</span><span>Shared files</span></div>
              <strong className="success">{loadFailed && files.length === 0 ? "—" : sharedCount}</strong>
              <small>With controlled access</small>
            </article>
          </section>

          <input
            ref={fileInputRef}
            className="file-input-hidden"
            type="file"
            multiple
            onChange={(event) => handleUpload(Array.from(event.target.files || []))}
          />

          <section
            className={`upload-zone${dragActive ? " drag-active" : ""}${uploading ? " is-uploading" : ""}`}
            onClick={() => !uploading && fileInputRef.current?.click()}
            role="button"
            tabIndex={uploading ? -1 : 0}
            aria-label="Upload files to your secure vault"
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !uploading) {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <div className="upload-orbit upload-orbit--one" aria-hidden="true" />
            <div className="upload-orbit upload-orbit--two" aria-hidden="true" />
            <div className="upload-center-icon" aria-hidden="true">
              <span className="upload-cloud">⇧</span>
              <span className="upload-spark upload-spark--one">✦</span>
              <span className="upload-spark upload-spark--two">✧</span>
            </div>
            <h3>{uploading ? "Securing your files…" : dragActive ? "Release to add to your vault" : "Drop files into your secure vault"}</h3>
            <p>{uploading ? "Your upload is in progress. Keep this page open." : "Drag and drop anywhere on this page, or browse your device"}</p>
            <div className="upload-meta"><span>↳ Multiple files supported</span><span>Up to 50 MB per file</span><span>Encrypted storage</span></div>
            {uploading && (
              <div className="upload-progress">
                <div className="progress-copy"><span>Uploading files</span><strong>{uploadProgress}%</strong></div>
                <div className="progress-track"><div style={{ width: `${uploadProgress}%` }} /></div>
              </div>
            )}
          </section>
          {error && !(loadFailed && files.length === 0) && (
            <div className="dashboard-error" role="alert">
              <span>{error}</span>
              {loadFailed && (
                <button type="button" onClick={loadData} disabled={refreshing}>
                  {refreshing ? "Retrying…" : "Retry"}
                </button>
              )}
            </div>
          )}

          <section className="file-section">
            <div className="file-section-header">
              <div>
                <div className="section-kicker">VAULT CONTENTS</div>
                <h2>Your files <span className="file-count-pill">{loadFailed && files.length === 0 ? "—" : files.length}</span></h2>
                <p>Everything you’ve stored, in one place.</p>
              </div>

              <input
                className="file-search"
                type="search"
                placeholder="Search your files…"
                aria-label="Search your files"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button
                className="dashboard-refresh-button"
                type="button"
                onClick={loadData}
                disabled={refreshing}
                aria-label="Refresh vault files"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            {loading ? (
              <div className="file-state">
                <strong>Loading your vault…</strong>
                <span>Retrieving your encrypted file metadata.</span>
              </div>
            ) : loadFailed && files.length === 0 ? (
              <div className="file-state" role="alert">
                <strong>{error || "Your vault could not be loaded."}</strong>
                <span>Retry the request to check your files.</span>
                <button type="button" className="dashboard-refresh-button" onClick={loadData} disabled={refreshing}>
                  {refreshing ? "Retrying…" : "Retry"}
                </button>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="file-state">
                <strong>{search ? "No matching files" : "Your vault is empty"}</strong>
                <span>
                  {search
                    ? "Try another search term."
                    : "Upload a file to get started."}
                </span>
              </div>
            ) : (
              <div className="file-list">
                {filteredFiles.map((file) => {
                  const name = getFileName(file);
                  const id = getFileId(file);
                  const type = getFileType(name);

                  return (
                    <article className="file-row" key={id || name}>
                      <div className={`file-type-icon type-${type}`} aria-label={`${type} file`}>
                        <span className="file-type-glyph" aria-hidden="true">{type === "image" ? "▧" : type === "video" ? "▶" : type === "audio" ? "♫" : getExtension(name).slice(0, 3)}</span>
                        <span className="file-type-extension">{getExtension(name)}</span>
                      </div>

                      <div className="file-details">
                        <strong title={name}>{name}</strong>
                        <span>
                          {formatBytes(file.size)} · {file.mimeType || file.mimetype || type}
                        </span>

                        <FileIntegrityDisclosure
                          hash={file.integrity?.sha256 ?? file.sha256 ?? file.hash ?? null}
                        />
                      </div>

                      <div className="file-actions">
                        <button
                          title="Download"
                          aria-label={`Download ${name}`}
                          onClick={() => handleDownload(file)}
                        >
                          ↓
                        </button>

                        <button
                          className="share-action"
                          title="Share securely"
                          aria-label={`Share ${name}`}
                          onClick={() => {
                            setShareFile(file);
                            setSharePassword("");
                            setShareExpiry("24");
                            setShareLimit("1");
                          }}
                        >
                          ↗
                        </button>

                        <button
                          className="delete-action"
                          title="Delete"
                          aria-label={`Delete ${name}`}
                          onClick={() => handleDelete(file)}
                        >
                          ×
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          <Suspense fallback={<section className="file-analytics" aria-labelledby="file-analytics-title" aria-busy="true"><h2 id="file-analytics-title">File Analytics</h2><p role="status">Loading analytics…</p></section>}>
            <FileAnalyticsSection />
          </Suspense>
      {dragActive && (
        <div className="drag-cursor-layer" aria-hidden="true">
          <div className="drag-cursor-core" style={{ left: dragPosition.x, top: dragPosition.y }}>
            <span className="drag-cursor-ring" />
            <span className="drag-file-chip drag-file-chip--pdf">PDF</span>
            <span className="drag-file-chip drag-file-chip--image">IMG</span>
            <span className="drag-file-chip drag-file-chip--doc">DOC</span>
            <span className="drag-file-chip drag-file-chip--zip">ZIP</span>
            <span className="drag-file-chip drag-file-chip--video">MP4</span>
          </div>
          <div className="drag-cursor-label" style={{ left: dragPosition.x + 28, top: dragPosition.y + 28 }}>DROP TO UPLOAD</div>
        </div>
      )}

      {shareFile && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !sharing) {
              setShareFile(null);
            }
          }}
        >
          <section
            className="share-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setShareFile(null)}
              disabled={sharing}
              aria-label="Close dialog"
            >
              ×
            </button>

            <div className="section-kicker">CONTROLLED ACCESS</div>
            <h2 id="share-title">Create secure share</h2>
            <p className="modal-subtitle">{getFileName(shareFile)}</p>

            <form onSubmit={handleShare}>
              <label className="form-field">
                <span>Password (8–128 characters)</span>
                <input
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                  value={sharePassword}
                  onChange={(event) => setSharePassword(event.target.value)}
                  placeholder="Set a share password"
                />
              </label>

              <div className="form-grid">
                <label className="form-field">
                  <span>Expires in</span>
                  <select
                    value={shareExpiry}
                    onChange={(event) => setShareExpiry(event.target.value)}
                  >
                    <option value="1">1 hour</option>
                    <option value="6">6 hours</option>
                    <option value="24">24 hours</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                    <option value="720">30 days</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Maximum downloads</span>
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    value={shareLimit}
                    onChange={(event) => setShareLimit(event.target.value)}
                    placeholder="Unlimited"
                    aria-describedby="dashboard-share-limit-help"
                  />
                  <small id="dashboard-share-limit-help">
                    Enter 1–100000, or leave blank for unlimited downloads.
                  </small>
                </label>
              </div>

              <div className="modal-note">
                Share links should use a random access token. Never include the
                file's internal storage path in a public link.
              </div>

              <button className="modal-submit" type="submit" disabled={sharing}>
                {sharing ? "Creating link…" : "Generate secure link"}
              </button>
            </form>
          </section>
        </div>
      )}

      {toast && (
        <div className={`dashboard-toast ${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
          {toast.message}
        </div>
      )}
      </AppShell>
    </div>
  );
}
