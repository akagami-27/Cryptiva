import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import "../styles/dashboard.css";

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
      window.location.href = "/react/login";
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
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [shareFile, setShareFile] = useState(null);
  const [sharePassword, setSharePassword] = useState("");
  const [shareExpiry, setShareExpiry] = useState("24");
  const [shareLimit, setShareLimit] = useState("1");
  const [sharing, setSharing] = useState(false);
  const [hashCopyState, setHashCopyState] = useState({});

  const fileInputRef = useRef(null);
  const toastTimer = useRef(null);

  const notify = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3500);
  }, []);

  async function copyFileHash(file) {
    const id = getFileId(file);
    const hash = file.integrity?.sha256 || file.sha256;
    if (!id || !hash || file.integrity?.verified !== true) return;

    setHashCopyState((current) => ({ ...current, [id]: "copying" }));
    try {
      await navigator.clipboard.writeText(hash);
      setHashCopyState((current) => ({ ...current, [id]: "copied" }));
    } catch {
      setHashCopyState((current) => ({ ...current, [id]: "error" }));
    }
  }

  const loadData = useCallback(async () => {
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
    } catch (err) {
      setError(err.message || "Unable to load your vault.");
    } finally {
      setLoading(false);
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

  const sharedCount = files.filter(
    (file) => file.isShared || file.shareToken || file.shared
  ).length;

  async function handleUpload(selectedFiles) {
    if (!selectedFiles?.length) return;

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
      }

      notify("Upload completed successfully.");
      await loadData();
    } catch (err) {
      setError(err.message || "Upload failed.");
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
    if (!id) return notify("File ID is missing.");

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
      notify(err.message || "Download failed.");
    }
  }

  async function handleDelete(file) {
    const id = getFileId(file);
    if (!id) return notify("File ID is missing.");

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
      notify(err.message || "Unable to delete file.");
    }
  }

  async function handleShare(event) {
    event.preventDefault();

    if (!shareFile) return;

    if (sharePassword.length < 8 || sharePassword.length > 128) {
      return notify("Password must be 8â€“128 characters.");
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
            maxDownloads: Number(shareLimit),
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
      notify(err.message || "Unable to create secure share.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <AppShell username={username} className="dashboard-page" contentClassName="dashboard-main">
          <section className="dashboard-hero">
            <div>
              <div className="hero-badge">
                <span className="hero-dot" />
                SECURE VAULT
              </div>

              <h1>
                Good to see you, <span>{username}</span>
              </h1>

              <p>Store, protect and share your files with controlled access.</p>
            </div>

            <button
              className="hero-upload"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploadingâ€¦" : "+ Upload files"}
            </button>
          </section>

          <section className="dashboard-stats">
            <article className="stat-card">
              <span>Total Files</span>
              <strong className="accent">{files.length}</strong>
            </article>

            <article className="stat-card">
              <span>Storage Used</span>
              <strong>{formatBytes(totalSize)}</strong>
            </article>

            <article className="stat-card">
              <span>Shared Files</span>
              <strong className="success">{sharedCount}</strong>
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
            className="upload-zone"
            onClick={() => !uploading && fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              event.currentTarget.classList.add("drag-active");
            }}
            onDragLeave={(event) => {
              event.currentTarget.classList.remove("drag-active");
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.currentTarget.classList.remove("drag-active");

              if (!uploading) {
                handleUpload(Array.from(event.dataTransfer.files || []));
              }
            }}
          >
            <div className="upload-icon">â˜</div>
            <h3>{uploading ? "Uploading your filesâ€¦" : "Drop files here or click to upload"}</h3>
            <p>Encrypted file storage Â· Maximum 50 MB per file</p>

            {uploading && (
              <div className="upload-progress">
                <span>{uploadProgress}%</span>
                <div className="progress-track">
                  <div style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
          </section>

          {error && <div className="dashboard-error">{error}</div>}

          <section className="file-section">
            <div className="file-section-header">
              <div>
                <div className="section-kicker">SECURE VAULT</div>
                <h2>Your Files</h2>
                <p>Encrypted files stored in your secure vault</p>
              </div>

              <input
                className="file-search"
                type="search"
                placeholder="Search files..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {loading ? (
              <div className="file-state">
                <strong>Loading your vaultâ€¦</strong>
                <span>Retrieving your encrypted file metadata.</span>
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
                      <div className={`file-type-icon type-${type}`}>
                        {getExtension(name)}
                      </div>

                      <div className="file-details">
                        <strong title={name}>{name}</strong>
                        <span>
                          {formatBytes(file.size)} Â· {file.mimeType || file.mimetype || type}
                        </span>

                        <details className="file-integrity">
                          <summary>SHA-256 Hash</summary>
                          {file.integrity?.verified === true &&
                          (file.integrity?.sha256 || file.sha256) ? (
                            <>
                              <p>Stored file hash (SHA-256)</p>
                              <code>{file.integrity?.sha256 || file.sha256}</code>
                              <button
                                type="button"
                                className="copy-hash-button"
                                onClick={() => copyFileHash(file)}
                                disabled={hashCopyState[id] === "copying"}
                              >
                                {hashCopyState[id] === "copying"
                                  ? "Copying..."
                                  : hashCopyState[id] === "copied"
                                    ? "Copied"
                                    : "Copy Hash"}
                              </button>
                              {hashCopyState[id] === "error" && (
                                <span className="hash-copy-error" role="status">
                                  Unable to copy hash. Select and copy it manually.
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="hash-copy-error" role="status">
                              A verified SHA-256 hash is unavailable for this file.
                            </span>
                          )}
                        </details>
                      </div>

                      <div className="file-actions">
                        <button
                          title="Download"
                          aria-label={`Download ${name}`}
                          onClick={() => handleDownload(file)}
                        >
                          â†“
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
                          â†—
                        </button>

                        <button
                          className="delete-action"
                          title="Delete"
                          aria-label={`Delete ${name}`}
                          onClick={() => handleDelete(file)}
                        >
                          Ã—
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
      

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
              Ã—
            </button>

            <div className="section-kicker">CONTROLLED ACCESS</div>
            <h2 id="share-title">Create secure share</h2>
            <p className="modal-subtitle">{getFileName(shareFile)}</p>

            <form onSubmit={handleShare}>
              <label className="form-field">
                <span>Password (8â€“128 characters)</span>
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
                  <select
                    value={shareLimit}
                    onChange={(event) => setShareLimit(event.target.value)}
                  >
                    <option value="1">1 download</option>
                    <option value="5">5 downloads</option>
                    <option value="10">10 downloads</option>
                    <option value="25">25 downloads</option>
                    <option value="50">50 downloads</option>
                    <option value="100">100 downloads</option>
                  </select>
                </label>
              </div>

              <div className="modal-note">
                Share links should use a random access token. Never include the
                file's internal storage path in a public link.
              </div>

              <button className="modal-submit" type="submit" disabled={sharing}>
                {sharing ? "Creating linkâ€¦" : "Generate secure link"}
              </button>
            </form>
          </section>
        </div>
      )}

      {toast && (
        <div className="dashboard-toast" role="status">
          {toast}
        </div>
      )}
    </AppShell>
  );
}

