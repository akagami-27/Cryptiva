import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../../api/client.js";
import "./analytics.css";

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];
const CATEGORY_COLORS = ["#45d8f2", "#8b72ff", "#42d6ae", "#f6c866", "#ef87ad"];
const CATEGORY_NAMES = {
  document: "Documents",
  image: "Images",
  audio: "Audio",
  video: "Video",
  other: "Other",
};

function formatBytes(value = 0) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(value, options = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function MetricCard({ label, value, detail, tone = "cyan" }) {
  return (
    <article className={`analytics-metric analytics-metric--${tone}`}>
      <div className="analytics-metric-label"><span aria-hidden="true" />{label}</div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ActivityChart({ points }) {
  const hasEvents = points.some((point) =>
    [point.uploads, point.downloads, point.sharesCreated, point.shareAccesses, point.deletions, point.sharesRevoked]
      .some((count) => Number(count) > 0)
  );
  if (!hasEvents) {
    return <div className="analytics-empty">No file or sharing activity is recorded for this range.</div>;
  }

  return (
    <div className="analytics-chart" role="img" aria-label="Recorded uploads, downloads, share activity, and deletions over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="analyticsUploads" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#44d7f2" stopOpacity={0.28} /><stop offset="100%" stopColor="#44d7f2" stopOpacity={0} /></linearGradient>
            <linearGradient id="analyticsDownloads" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9b83ff" stopOpacity={0.24} /><stop offset="100%" stopColor="#9b83ff" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke="#9fb2d21b" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(value) => value.length === 7 ? value : value.slice(5)} tickLine={false} axisLine={false} tick={{ fill: "#7d8aa4", fontSize: 10 }} minTickGap={22} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#7d8aa4", fontSize: 10 }} width={34} />
          <Tooltip
            contentStyle={{ background: "#101827", border: "1px solid #ffffff20", borderRadius: 10, color: "#edf3ff", fontSize: 11 }}
            labelStyle={{ color: "#aebbd2", marginBottom: 4 }}
            labelFormatter={(value) => value}
          />
          <Area type="monotone" dataKey="uploads" name="Uploads" stroke="#45d8f2" fill="url(#analyticsUploads)" strokeWidth={2} />
          <Area type="monotone" dataKey="downloads" name="Downloads" stroke="#a18aff" fill="url(#analyticsDownloads)" strokeWidth={2} />
          <Area type="monotone" dataKey="sharesCreated" name="Shares created" stroke="#49d8ad" fill="transparent" strokeWidth={1.8} />
          <Area type="monotone" dataKey="shareAccesses" name="Share links accessed" stroke="#f1c66b" fill="transparent" strokeWidth={1.6} />
          <Area type="monotone" dataKey="deletions" name="Files deleted" stroke="#f185a2" fill="transparent" strokeWidth={1.6} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function StorageBreakdown({ categories }) {
  const chartData = categories.filter((item) => Number(item.bytes) > 0);
  if (!chartData.length) return <div className="analytics-empty">Upload a file to see your storage breakdown.</div>;
  const totalBytes = chartData.reduce((sum, item) => sum + Number(item.bytes || 0), 0);

  return (
    <div className="analytics-storage-layout">
      <div className="analytics-donut" role="img" aria-label="File storage by category">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="bytes" nameKey="category" innerRadius="66%" outerRadius="90%" paddingAngle={3} stroke="none">
              {chartData.map((item, index) => <Cell key={item.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />)}
            </Pie>
            <Tooltip
              formatter={(value, name) => [formatBytes(value), CATEGORY_NAMES[name] || name]}
              contentStyle={{ background: "#101827", border: "1px solid #ffffff20", borderRadius: 10, color: "#edf3ff", fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="analytics-donut-center"><strong>{formatBytes(totalBytes)}</strong><span>logical size</span></div>
      </div>
      <ul className="analytics-category-list">
        {chartData.map((item, index) => {
          const percentage = totalBytes ? Math.round(Number(item.bytes) / totalBytes * 100) : 0;
          return (
            <li key={item.category}>
              <span className="analytics-category-dot" style={{ "--category-color": CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
              <span className="analytics-category-name">{CATEGORY_NAMES[item.category] || "Other"}<small>{item.files} file{item.files === 1 ? "" : "s"}</small></span>
              <strong>{percentage}%<small>{formatBytes(item.bytes)}</small></strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LargestFiles({ files }) {
  if (!files.length) return <div className="analytics-empty">Your file list is empty.</div>;
  return (
    <div className="analytics-table-wrap">
      <table className="analytics-table">
        <thead><tr><th scope="col">File</th><th scope="col">Type</th><th scope="col">Size</th><th scope="col">Uploaded</th></tr></thead>
        <tbody>{files.map((file) => (
          <tr key={`${file.name}:${file.uploadedAt}`}>
            <td title={file.name}>{file.name || "Untitled file"}</td>
            <td>{CATEGORY_NAMES[file.category] || "Other"}</td>
            <td>{formatBytes(file.size)}</td>
            <td>{formatDate(file.uploadedAt, { year: "numeric", month: "short", day: "numeric" })}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function ShareStatus({ shares, downloadsByFile }) {
  const items = [
    ["Active now", shares.active, "active"],
    ["Expiring in 7 days", shares.expiringSoon, "soon"],
    ["Expired", shares.expired, "muted"],
    ["Revoked", shares.revoked, "muted"],
    ["Download limit reached", shares.limitReached, "muted"],
    ["Password protected", shares.passwordProtected, "muted"],
    ["Links with download limits", shares.downloadLimited, "muted"],
  ];
  return (
    <div className="analytics-share-grid">
      {items.map(([label, value, tone]) => <div className={`analytics-share-item is-${tone}`} key={label}><span>{label}</span><strong>{Number(value || 0)}</strong></div>)}
      <p className="analytics-share-remaining">Remaining downloads across active limited links <strong>{Number(shares.remainingLimitedDownloads || 0)}</strong></p>
      <Link className="analytics-inline-link" to="/shared">Manage your sharing links <span aria-hidden="true">→</span></Link>
      {downloadsByFile.length > 0 && <div className="analytics-share-downloads"><h4>Downloads by shared file</h4>{downloadsByFile.map((file) => <div key={`${file.name}:${file.downloads}`}><span title={file.name}>{file.name}</span><strong>{file.downloads}{file.maximum ? <small> / {file.maximum} · {file.remaining} left</small> : <small> downloads</small>}</strong></div>)}</div>}
    </div>
  );
}

function RecentActivity({ events }) {
  if (!events.length) return <div className="analytics-empty">No recorded account activity in this range.</div>;
  return (
    <ol className="analytics-activity-list">
      {events.map((event, index) => (
        <li key={`${event.action}:${event.createdAt}:${index}`}>
          <span className={`analytics-activity-dot is-${event.status === "success" ? "success" : "attention"}`} aria-hidden="true" />
          <div><strong>{event.description || event.action.replaceAll("_", " ")}</strong><time dateTime={event.createdAt}>{formatDate(event.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div>
        </li>
      ))}
    </ol>
  );
}

export default function FileAnalyticsSection() {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [inventoryMode, setInventoryMode] = useState("largest");

  useEffect(() => {
    let active = true;
    setError("");
    setLoading(!data);
    apiFetch(`/analytics/summary?range=${encodeURIComponent(range)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Analytics are temporarily unavailable.");
        return result;
      })
      .then((result) => { if (active) setData(result); })
      .catch((requestError) => { if (active) setError(requestError.message || "Analytics are temporarily unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range, retry]);

  return (
    <section className="file-analytics" aria-labelledby="file-analytics-title" aria-busy={loading}>
      <header className="analytics-heading">
        <div>
          <div className="analytics-eyebrow"><span /> VAULT INSIGHTS</div>
          <h2 id="file-analytics-title">File Analytics</h2>
          <p>Understand storage, file activity, sharing, and the integrity records available for your vault.</p>
        </div>
        <label className="analytics-range-label">
          <span>Activity range</span>
          <select value={range} onChange={(event) => setRange(event.target.value)} aria-label="Analytics activity time range">
            {RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </header>

      {error && <div className="analytics-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry((value) => value + 1)}>Retry analytics</button></div>}
      {loading && !data ? (
        <div className="analytics-loading" role="status" aria-label="Loading file analytics">
          {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
        </div>
      ) : data ? (
        <>
          <div className="analytics-metrics">
            <MetricCard label="Total files" value={data.summary.totalFiles} detail="Current vault total" tone="violet" />
            <MetricCard label="Storage used" value={formatBytes(data.summary.storageBytes)} detail="Logical file sizes · current" tone="cyan" />
            <MetricCard label="Active shares" value={data.summary.activeShares} detail="Links currently available" tone="green" />
            <MetricCard label="Total downloads" value={data.summary.totalDownloads} detail="Direct audit events + current share counters" tone="amber" />
            <MetricCard label="Uploads in range" value={data.summary.uploadsInPeriod} detail={`Recorded · ${RANGE_OPTIONS.find((item) => item.value === range)?.label}`} tone="cyan" />
            <MetricCard label="Downloads in range" value={data.summary.downloadsInPeriod} detail="Successful account events recorded" tone="violet" />
            <MetricCard label="Expiring soon" value={data.summary.expiringSoon} detail="Active links expiring in 7 days" tone="amber" />
            <MetricCard label="Files with SHA-256 record" value={`${data.summary.filesWithIntegrityRecord}/${data.summary.totalFiles}`} detail="Record presence; historical checks are not tracked" tone="green" />
          </div>
          {data.summary.totalFiles === 0 && <p className="analytics-empty">Your vault is empty. Upload a file to start seeing storage and activity analytics.</p>}

          <div className="analytics-panels analytics-panels--charts">
            <article className="analytics-panel analytics-panel--wide">
              <div className="analytics-panel-heading"><div><h3>Recorded file activity</h3><p>Successful account events in {RANGE_OPTIONS.find((item) => item.value === range)?.label.toLowerCase()}.</p></div><span className="analytics-panel-tag">ACTIVITY LOG</span></div>
              <ActivityChart points={data.activity} />
              <div className="analytics-legend"><span><i className="legend-cyan" />Uploads</span><span><i className="legend-violet" />Downloads</span><span><i className="legend-green" />Shares created</span><span><i className="legend-amber" />Links accessed</span><span><i className="legend-rose" />Files deleted</span></div>
            </article>
            <article className="analytics-panel">
              <div className="analytics-panel-heading"><div><h3>Storage by file type</h3><p>Current stored-file size distribution.</p></div></div>
              <StorageBreakdown categories={data.storage.categories} />
            </article>
          </div>

          <div className="analytics-panels analytics-panels--details">
            <article className="analytics-panel analytics-panel--wide">
              <div className="analytics-panel-heading"><div><h3>{inventoryMode === "largest" ? "Largest files" : "Recently uploaded"}</h3><p>Top five · Average size: {formatBytes(data.summary.averageBytes)}.</p></div><div className="analytics-inventory-actions"><label className="analytics-sr-only" htmlFor="analytics-inventory-sort">Sort file list</label><select id="analytics-inventory-sort" value={inventoryMode} onChange={(event) => setInventoryMode(event.target.value)}><option value="largest">Largest</option><option value="recent">Most recent</option></select><Link className="analytics-panel-link" to="/files">All files <span aria-hidden="true">→</span></Link></div></div>
              <LargestFiles files={inventoryMode === "largest" ? data.storage.largest : data.storage.recentUploads} />
            </article>
            <article className="analytics-panel">
              <div className="analytics-panel-heading"><div><h3>Sharing status</h3><p>Current share-link state.</p></div></div>
              <ShareStatus shares={data.shares} downloadsByFile={data.downloadsBySharedFile} />
            </article>
          </div>

          <div className="analytics-panels analytics-panels--bottom">
            <article className="analytics-panel">
              <div className="analytics-panel-heading"><div><h3>Insights</h3><p>Based on the records currently available.</p></div></div>
              <ul className="analytics-insights">{data.insights.map((insight, index) => <li key={`${insight.message}:${index}`}><span aria-hidden="true">↗</span><p>{insight.message}</p><Link to={insight.href}>{insight.label}</Link></li>)}</ul>
            </article>
            <article className="analytics-panel">
              <div className="analytics-panel-heading"><div><h3>Recent activity</h3><p>Your recorded account events.</p></div><Link className="analytics-panel-link" to="/activity">All activity <span aria-hidden="true">→</span></Link></div>
              <RecentActivity events={data.recentActivity} />
            </article>
          </div>

          <p className="analytics-footnote">{data.trackingNotes.storage} {data.trackingNotes.integrity} {data.trackingNotes.malware} {data.trackingNotes.activity}</p>
        </>
      ) : null}
    </section>
  );
}
