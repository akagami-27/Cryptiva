
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import "../styles/files.css";
import FileIntegrityDisclosure from "../components/FileIntegrityDisclosure";
import { parseShareLimit } from "../utils/shareLimit";

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
    if (["document", "image", "audio", "video", "archive", "file"].includes(category)) {
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
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) {
    return "archive";
  }
  if (["pdf", "doc", "docx", "odt", "rtf", "txt", "md", "xls", "xlsx", "csv", "ppt", "pptx"].includes(extension)) {
    return "document";
  }

  return "file";
};

function FileTypeIcon({ file }) {
  const type = getCategory(file);

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {type === "image" ? (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <circle cx="9" cy="9.5" r="1.5" />
          <path d="m5 17 4.5-4 3 2 2.5-2.5 4 4.5" />
        </>
      ) : type === "video" ? (
        <>
          <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
          <path d="m10 9 5 3-5 3z" />
        </>
      ) : type === "audio" ? (
        <path d="M14 5v11.2a3.2 3.2 0 1 1-2-3V8l7-1.5v7.7a3.2 3.2 0 1 1-2-3V5.4z" />
      ) : type === "archive" ? (
        <path d="M4 7.5h16v12H4zM3 4.5h18v3H3zM10 10h4v2h-4zM10 12v3h4v-3" />
      ) : (
        <>
          <path d="M6 3.5h8l4 4v13H6z" />
          <path d="M14 3.5v4h4M9 12h6M9 15.5h6" />
        </>
      )}
    </svg>
  );
}

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
  const [sortBy, setSortBy] = useState("date-desc");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [username, setUsername] = useState("User");
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [dragExtension, setDragExtension] = useState("FILE");
  const [toast, setToast] = useState(null);
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
    if (!initial) setRefreshing(true);

    try {
      const [me, result] = await Promise.all([
        apiRequest("/me"),
        apiRequest("/files/data"),
      ]);

      setUsername(me?.user?.username || "User");
      setFiles(Array.isArray(result?.files) ? result.files : []);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load files.");
    } finally {
      if (initial) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFiles(true);

    return () => {
      window.clearTimeout(toastTimer.current);
    };
  }, [loadFiles]);

  useEffect(() => {
    let dragDepth = 0;
    const isFileDrag = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
    const onDragEnter = (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setDragActive(true);
      const item = Array.from(event.dataTransfer?.items || []).find((entry) => entry.kind === "file");
      const name = item?.getAsFile?.()?.name || "";
      setDragExtension(name.includes(".") ? name.split(".").pop().slice(0, 5).toUpperCase() : "FILE");
    };
    const onDragOver = (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = uploading ? "none" : "copy";
    };
    const onDragLeave = (event) => {
      if (!isFileDrag(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragActive(false);
    };
    const onDrop = (event) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      dragDepth = 0;
      setDragActive(false);
      if (!uploading) uploadFiles(Array.from(event.dataTransfer.files));
    };

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, [uploading]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matchingFiles = files.filter((file) => {
      const matchesSearch = getFileName(file).toLowerCase().includes(query);
      const category = getCategory(file);
      const matchesFilter = filter === "all" || category === filter;

      return matchesSearch && matchesFilter;
    });

    return matchingFiles.sort((left, right) => {
      if (sortBy === "name-asc") {
        return getFileName(left).localeCompare(getFileName(right));
      }
      if (sortBy === "size-desc") {
        return (Number(right.size) || 0) - (Number(left.size) || 0);
      }

      const leftDate = new Date(left.createdAt || left.uploadedAt || 0).getTime() || 0;
      const rightDate = new Date(right.createdAt || right.uploadedAt || 0).getTime() || 0;
      return sortBy === "date-asc" ? leftDate - rightDate : rightDate - leftDate;
    });
  }, [files, search, filter, sortBy]);

  const latestUpload = useMemo(() => files.reduce((latest, file) => {
    const timestamp = new Date(file.createdAt || file.uploadedAt || 0).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= 0) return latest;
    return !latest || timestamp > latest.timestamp ? { file, timestamp } : latest;
  }, null), [files]);
  const storage = useMemo(
    () => files.reduce((total, file) => total + (Number(file.size) || 0), 0),
    [files]
  );

  async function uploadFiles(selectedFiles) {
    if (!selectedFiles.length || uploading) return;

    let uploadedCount = 0;
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
        uploadedCount += 1;
      }

      notify("Upload completed successfully.");
      await loadFiles();
    } catch (err) {
      await loadFiles();
      const uploadError = err.message || "Upload could not be completed.";
      notify(uploadedCount > 0
        ? `${uploadedCount} file${uploadedCount === 1 ? " was" : "s were"} uploaded before the batch stopped. ${uploadError}`
        : uploadError, "error");
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
        { credentials: "same-origin", headers: { Accept: "application/json" } }
      );

      if (response.status === 401) {
        window.location.assign("/react/login");
        throw new Error("Your sign-in has expired. Please sign in again.");
      }

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

    let maxDownloads;
    try {
      maxDownloads = parseShareLimit(shareLimit);
    } catch (err) {
      return notify(err.message, "error");
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
                    maxDownloads,
          }),
        }
      );

      const returnedShareUrl = result?.shareUrl || result?.share?.shareUrl || result?.url;
      const shareUrl = returnedShareUrl
        ? new URL(returnedShareUrl, window.location.origin).toString()
        : "";

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

  return (
    <AppShell username={username} className={`dashboard-page files-page${dragActive ? " is-file-dragging" : ""}`} contentClassName="dashboard-main">
          <header className="files-header">
            <div className="files-header-copy">
              <div className="files-eyebrow">
                <span className="files-eyebrow-dot" />
                Secure vault
              </div>
              <h1>My Files</h1>
              <p>Find, upload and manage files in your personal vault.</p>
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
              <div className="files-stat-icon files-stat-icon-purple" aria-hidden="true">▤</div>
              <div>
                <div className="files-stat-label">Total files</div>
                <div className="files-stat-value">{files.length}</div>
              </div>
            </article>

            <article className="files-stat-card">
              <div className="files-stat-icon files-stat-icon-blue" aria-hidden="true">↓</div>
              <div>
                <div className="files-stat-label">Storage used</div>
                <div className="files-stat-value">{formatSize(storage)}</div>
              </div>
            </article>

            <article className="files-stat-card files-stat-card-recent">
              <div className="files-stat-icon files-stat-icon-green" aria-hidden="true">◷</div>
              <div>
                <div className="files-stat-label">Most recent upload</div>
                <div className="files-stat-value" title={latestUpload ? getFileName(latestUpload.file) : undefined}>
                  {latestUpload ? getFileName(latestUpload.file) : "No uploads yet"}
                </div>
                {latestUpload && <small>{formatDate(latestUpload.file.createdAt || latestUpload.file.uploadedAt)}</small>}
              </div>
            </article>
          </section>

          {uploading && (
            <div className="upload-progress" role="status" aria-live="polite">
              <span>Uploading… {uploadProgress}%</span>
              <div className="progress-track">
                <div style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {error && files.length > 0 && (
            <div className="dashboard-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => loadFiles()} disabled={refreshing}>
                {refreshing ? "Retrying…" : "Retry"}
              </button>
            </div>
          )}

          <section className="files-toolbar">
            <div className="files-toolbar-title">
              <h2>Your files</h2>
              <span className="files-count">
                {filtered.length} of {files.length} {files.length === 1 ? "file" : "files"}
              </span>
              {(search || filter !== "all") && (
                <button
                  type="button"
                  className="files-clear-filters"
                  onClick={() => { setSearch(""); setFilter("all"); }}
                >
                  Clear filters
                </button>
              )}
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
                <option value="archive">Archives</option>
                <option value="file">Other file types</option>
              </select>
              <select
                className="files-filter files-sort"
                aria-label="Sort files"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="name-asc">Name A–Z</option>
                <option value="size-desc">Largest first</option>
              </select>
              <button
                type="button"
                className="files-refresh-button"
                onClick={() => loadFiles()}
                disabled={refreshing}
                aria-label="Refresh files"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </section>

          <section className="files-list-card" aria-label="Your files">
            {loading ? (
              <div className="files-loading">
                <div className="files-spinner" />
                <span>Loading your encrypted vault...</span>
              </div>
            ) : error && files.length === 0 ? (
              <div className="files-empty" role="alert">
                <h3>Files could not be loaded</h3>
                <p>{error}</p>
                <button
                  type="button"
                  className="files-empty-button"
                  onClick={() => loadFiles()}
                  disabled={refreshing}
                >
                  {refreshing ? "Retrying…" : "Retry"}
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="files-empty">
                <div className="files-empty-icon" aria-hidden="true"><FileTypeIcon file={{ name: "vault-file" }} /></div>
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
                    const hash = file.integrity?.sha256 ?? file.sha256 ?? file.hash ?? null;
                    const encryptionAlgorithm = file.encryption?.algorithm;
                    const encryptionLabel = encryptionAlgorithm
                      ? String(encryptionAlgorithm).toUpperCase()
                      : null;

                    return (
                      <div className="files-file-row" key={id || name}>
                        <div className="files-file-main">
                          <div className="files-file-icon" data-type={getCategory(file)} data-extension={name.includes(".") ? name.split(".").pop().toLowerCase() : ""}><FileTypeIcon file={file} /></div>

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
                                  ? name.split(".").pop().slice(0, 5).toUpperCase()
                                  : "FILE"}
                              </span>
                            </div>

                            <FileIntegrityDisclosure hash={hash} />
                          </div>
                        </div>

                        <div className="files-file-size">
                          {formatSize(file.size)}
                        </div>

                        <div className="files-file-date">
                          {formatDate(file.uploadedAt || file.createdAt)}
                        </div>

                        <div>
                          {encryptionLabel && (
                            <span className="files-security-status" title={`Encrypted at rest using ${encryptionLabel}`}>
                              <span className="files-security-status-dot" />
                              {encryptionLabel}
                            </span>
                          )}
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
                            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4"/></svg>
                          </button>

                          <button
                            type="button"
                            className="files-action-button"
                            title="Download file"
                            aria-label={`Download ${name}`}
                            onClick={() => downloadFile(file)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3"/></svg>
                          </button>

                          <button
                            type="button"
                            className="files-action-button delete"
                            title="Delete file"
                            aria-label={`Delete ${name}`}
                            onClick={() => setSelected(file)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="files-security-note" aria-labelledby="vault-protection-title">
            <div className="files-security-note-heading">
              <div className="files-security-note-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z"/><path d="M9 12h6"/></svg></div>
              <div>
                <strong id="vault-protection-title">Vault protection</strong>
                <p>Protection built into Cryptiva’s file storage and sharing flows.</p>
              </div>
            </div>
            <div className="files-security-grid">
              <article className="files-security-item">
                <span className="files-security-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>
                <div><strong>AES-256-GCM encryption</strong><p>File contents are encrypted before they are stored.</p></div>
              </article>
              <article className="files-security-item">
                <span className="files-security-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg></span>
                <div><strong>SHA-256 integrity reference</strong><p>Cryptiva checks file contents against the stored digest during protected downloads.</p></div>
              </article>
              <article className="files-security-item">
                <span className="files-security-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4"/></svg></span>
                <div><strong>Controlled file sharing</strong><p>Share links support passwords, expiry times, and download limits.</p></div>
              </article>
            </div>
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
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    value={shareLimit}
                    onChange={(event) => setShareLimit(event.target.value)}
                    placeholder="Unlimited"
                    aria-describedby="share-limit-help"
                  />
                  <small id="share-limit-help">
                    Enter 1–100000, or leave blank for unlimited downloads.
                  </small>
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
      {dragActive && (
        <div className="files-drop-overlay" aria-live="polite">
          <div className="files-drop-card">
            <span className="files-drop-tile" aria-hidden="true">{dragExtension}</span>
            <strong>Release to add to your vault</strong>
            <span>Files will use the existing secure upload flow.</span>
          </div>
        </div>
      )}
    </AppShell>
  );
}

