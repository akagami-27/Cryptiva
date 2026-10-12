
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "../components/sidebar";
import "../styles/files.css";

const formatSize = (bytes = 0) => {
  const units = ["B", "KB", "MB", "GB"];
  let size = Number(bytes) || 0;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }

  return `${index === 0 ? size : size.toFixed(1)} ${units[index]}`;
};

const formatDate = (value) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Unknown";

  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getFileName = (file) =>
  file.originalName || file.filename || file.name || "Untitled file";

const getFileId = (file) => file.id || file._id;

const getCategory = (file) => {
  if (file.category) {
    const category = file.category.toLowerCase();
    if (["document", "image", "audio", "video"].includes(category)) {
      return category;
    }
  }

  const extension = getFileName(file).split(".").pop().toLowerCase();

  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
    return "image";
  }
  if (["mp3", "wav", "ogg", "flac"].includes(extension)) return "audio";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(extension)) {
    return "video";
  }

  return "document";
};

async function getCsrfToken() {
  const pageToken =
    document.querySelector('meta[name="csrf-token"]')?.content?.trim() ||
    document.querySelector('input[name="_csrf"]')?.value?.trim() ||
    "";

  if (pageToken) return pageToken;

  const response = await fetch("/csrf-token", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.csrfToken) {
    throw new Error(data.error || "Unable to retrieve CSRF token. Refresh and sign in again.");
  }

  return data.csrfToken;
}

async function apiRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  const method = (options.method || "GET").toUpperCase();

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = await getCsrfToken();
    headers.set("X-CSRF-Token", token);
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (response.status === 401) {
    window.location.href = "/react/login";
    throw new Error("Your session has expired.");
  }

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || `Request failed (${response.status})`
    );
  }

  return data;
}

export default function Files() {
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("User");
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState(null);
  const [storage, setStorage] = useState(0);
  const [error, setError] = useState("");

  const [shareFile, setShareFile] = useState(null);
  const [sharePassword, setSharePassword] = useState("");
  const [shareExpiry, setShareExpiry] = useState("24");
  const [shareLimit, setShareLimit] = useState("1");
  const [sharing, setSharing] = useState(false);

  const inputRef = useRef(null);
  const toastTimer = useRef(null);

  const notify = useCallback((message, type = "success") => {
    window.clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadFiles = useCallback(async (initial = false) => {
    try {
      const [me, result] = await Promise.all([
        apiRequest("/me"),
        apiRequest("/files/data"),
      ]);

      setUsername(me?.user?.username || "User");
      setFiles(Array.isArray(result?.files) ? result.files : []);
      setStorage(
        Number(
          result?.totalSize ??
          result?.files?.reduce(
            (sum, file) => sum + (Number(file.size) || 0),
            0
          )
        ) || 0
      );
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load files.");
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles(true);

    const timer = window.setInterval(() => {
      if (!uploading && !deleting && !sharing) {
        loadFiles();
      }
    }, 3000);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(toastTimer.current);
    };
  }, [loadFiles, uploading, deleting, sharing]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return files.filter((file) => {
      const matchesSearch = getFileName(file).toLowerCase().includes(query);
      const category = getCategory(file);
      const matchesFilter = filter === "all" || category === filter;

      return matchesSearch && matchesFilter;
    });
  }, [files, search, filter]);

  async function uploadFiles(selectedFiles) {
    if (!selectedFiles.length || uploading) return;

    setUploading(true);
    setUploadProgress(0);
    setError("");

    try {
      const token = await getCsrfToken();

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("files", file);

        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/files/upload");
          xhr.withCredentials = true;
          xhr.setRequestHeader("Accept", "application/json");

          if (token) xhr.setRequestHeader("X-CSRF-Token", token);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              setUploadProgress(
                Math.round((event.loaded / event.total) * 100)
              );
            }
          };

          xhr.onload = () => {
            let data = {};

            try {
              data = JSON.parse(xhr.responseText);
            } catch {
              // The server may return a non-JSON response.
            }

            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              reject(
                new Error(
                  data.message || data.error || `Upload failed (${xhr.status})`
                )
              );
            }
          };

          xhr.onerror = () => reject(new Error("Network error during upload."));
          xhr.send(formData);
        });
      }

      notify("Upload completed successfully.");
      await loadFiles();
    } catch (err) {
      notify(err.message || "Upload failed.", "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);

      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function downloadFile(file) {
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

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Download started.");
    } catch (err) {
      notify(err.message || "Download failed.", "error");
    }
  }

  async function deleteFile() {
    if (!selected || deleting) return;

    const id = getFileId(selected);
    if (!id) return notify("File ID is missing.", "error");

    setDeleting(true);

    try {
      await apiRequest(`/files/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      setFiles((current) =>
        current.filter((file) => getFileId(file) !== id)
      );

      setSelected(null);
      notify("File deleted successfully.");
      await loadFiles();
    } catch (err) {
      notify(err.message || "Unable to delete file.", "error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleShare(event) {
    event.preventDefault();
    if (!shareFile || sharing) return;

    if (sharePassword.length < 8 || sharePassword.length > 128) {
      return notify("Password must be 8–128 characters.", "error");
    }

    const id = getFileId(shareFile);
    if (!id) return notify("File ID is missing.", "error");

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
        (result?.token
          ? `${window.location.origin}/share/${result.token}`
          : "");

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
      await loadFiles();
    } catch (err) {
      notify(err.message || "Unable to create secure share.", "error");
    } finally {
      setSharing(false);
    }
  }

  function iconFor(file) {
    const category = getCategory(file);
    const icons = {
      image: "▧",
      video: "▶",
      audio: "♫",
      document: "▤",
    };
    return icons[category] || "▤";
  }

  return (
    <div className="files-page">
      <Sidebar username={username} />

      <main className="files-shell">
        <section className="files-content">
          <header className="files-header">
            <div className="files-header-copy">
              <div className="files-eyebrow">
                <span className="files-eyebrow-dot" />
                Secure vault
              </div>
              <h1>My Files</h1>
              <p>Manage your encrypted files and secure storage.</p>
            </div>

            <button
              type="button"
              className="files-upload-button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <span className="files-upload-button-icon">+</span>
              {uploading ? "Uploading..." : "Upload files"}
            </button>

            <input
              ref={inputRef}
              type="file"
              hidden
              multiple
              onChange={(event) =>
                uploadFiles(Array.from(event.target.files || []))
              }
            />
          </header>

          <section className="files-stats">
            <article className="files-stat-card">
              <div className="files-stat-icon files-stat-icon-purple">▤</div>
              <div>
                <div className="files-stat-label">Total files</div>
                <div className="files-stat-value">{files.length}</div>
              </div>
            </article>

            <article className="files-stat-card">
              <div className="files-stat-icon files-stat-icon-blue">↓</div>
              <div>
                <div className="files-stat-label">Storage used</div>
                <div className="files-stat-value">{formatSize(storage)}</div>
              </div>
            </article>

            <article className="files-stat-card">
              <div className="files-stat-icon files-stat-icon-green">✓</div>
              <div>
                <div className="files-stat-label">Protected</div>
                <div className="files-stat-value">100%</div>
              </div>
            </article>
          </section>

          {uploading && (
            <div className="upload-progress">
              <span>Uploading… {uploadProgress}%</span>
              <div className="progress-track">
                <div style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {error && <div className="dashboard-error">{error}</div>}

          <section className="files-toolbar">
            <div className="files-toolbar-title">
              <h2>Your files</h2>
              <span className="files-count">
                {filtered.length} {filtered.length === 1 ? "file" : "files"}
              </span>
            </div>

            <div className="files-toolbar-actions">
              <div className="files-search">
                <input
                  type="search"
                  placeholder="Search files..."
                  aria-label="Search files"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <select
                className="files-filter"
                aria-label="Filter files"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">All files</option>
                <option value="document">Documents</option>
                <option value="image">Images</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
            </div>
          </section>

          <section className="files-list-card" aria-label="Your files">
            {loading ? (
              <div className="files-loading">
                <div className="files-spinner" />
                <span>Loading your encrypted vault...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="files-empty">
                <div className="files-empty-icon">▤</div>
                <h3>{files.length ? "No matching files" : "No files yet"}</h3>
                <p>
                  {files.length
                    ? "Try a different search term or file filter."
                    : "Upload your first file to start using your secure vault."}
                </p>
                {files.length > 0 && (
                  <button
                    className="files-empty-button"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="files-table-wrap">
                <div className="files-table-head">
                  <div>File</div>
                  <div>Size</div>
                  <div>Uploaded</div>
                  <div>Security</div>
                  <div>Actions</div>
                </div>

                <div className="files-table-body">
                  {filtered.map((file) => {
                    const id = getFileId(file);
                    const name = getFileName(file);
                    const hash = file.sha256 || file.hash || "";

                    return (
                      <div className="files-file-row" key={id || name}>
                        <div className="files-file-main">
                          <div className="files-file-icon">{iconFor(file)}</div>

                          <div className="files-file-copy">
                            <div className="files-file-name" title={name}>
                              {name}
                            </div>

                            <div className="files-file-meta">
                              <span>
                                {getCategory(file).charAt(0).toUpperCase() +
                                  getCategory(file).slice(1)}
                              </span>
                              <span className="files-file-meta-dot" />
                              <span>
                                {name.includes(".")
                                  ? name.split(".").pop().toUpperCase()
                                  : "FILE"}
                              </span>
                            </div>

                            {hash && (
                              <details className="file-integrity">
                                <summary>SHA-256 integrity hash</summary>
                                <code>{hash}</code>
                              </details>
                            )}
                          </div>
                        </div>

                        <div className="files-file-size">
                          {formatSize(file.size)}
                        </div>

                        <div className="files-file-date">
                          {formatDate(file.uploadedAt || file.createdAt)}
                        </div>

                        <div>
                          <span className="files-security-status">
                            <span className="files-security-status-dot" />
                            {file.hasActiveShare || file.isShared || file.shared
                              ? "Shared"
                              : "Encrypted"}
                          </span>
                        </div>

                        <div className="files-actions">
                          <button
                            type="button"
                            className="files-action-button"
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
                            type="button"
                            className="files-action-button"
                            title="Download file"
                            aria-label={`Download ${name}`}
                            onClick={() => downloadFile(file)}
                          >
                            ↓
                          </button>

                          <button
                            type="button"
                            className="files-action-button delete"
                            title="Delete file"
                            aria-label={`Delete ${name}`}
                            onClick={() => setSelected(file)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="files-security-note">
            <div className="files-security-note-icon">✓</div>
            <div>
              <strong>Your files are encrypted</strong>
              <p>
                SHA-256 hashes can help verify file integrity when the server
                provides the stored hash.
              </p>
            </div>
          </section>
        </section>
      </main>

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
              onClick={() => !sharing && setShareFile(null)}
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
                Share links should use a random access token. Never expose a
                file's internal storage path.
              </div>

              <button
                className="modal-submit"
                type="submit"
                disabled={sharing}
              >
                {sharing ? "Creating link…" : "Generate secure link"}
              </button>
            </form>
          </section>
        </div>
      )}

      {selected && (
        <div className="files-modal" role="dialog" aria-modal="true">
          <div
            className="files-modal-backdrop"
            onClick={() => !deleting && setSelected(null)}
          />
          <div className="files-modal-card">
            <div className="files-modal-icon danger">!</div>
            <h2>Delete file?</h2>
            <p>
              This will permanently remove the file and its associated sharing
              configuration.
            </p>
            <div className="files-delete-name">{getFileName(selected)}</div>

            <div className="files-modal-actions">
              <button
                type="button"
                className="files-modal-cancel"
                disabled={deleting}
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="files-modal-danger"
                disabled={deleting}
                onClick={deleteFile}
              >
                {deleting ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`files-toast ${toast.type} show`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
