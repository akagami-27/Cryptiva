import { useEffect, useId, useRef, useState } from "react";
import "../styles/file-integrity.css";

export default function FileIntegrityDisclosure({ hash }) {
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const disclosureId = useId();
  const labelId = useId();
  const feedbackTimer = useRef(null);
  const available = typeof hash === "string" && hash.length > 0;

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);

  async function copyHash() {
    if (!available) return;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable.");
      }

      await navigator.clipboard.writeText(hash);
      setCopyStatus("Hash copied to clipboard.");
    } catch {
      setCopyStatus("Unable to copy. Select the complete hash and copy it manually.");
    }

    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setCopyStatus(""), 3200);
  }

  return (
    <section className={`integrity-inspector${expanded ? " is-open" : ""}`}>
      <button
        className="integrity-disclosure-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={disclosureId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className={`integrity-status-dot${available ? " is-available" : ""}`} aria-hidden="true" />
        <span>SHA-256 integrity</span>
        <span className="integrity-toggle-label">{expanded ? "Hide details" : "View hash"}</span>
        <svg className="integrity-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m3.5 6 4.5 4 4.5-4" />
        </svg>
      </button>

      <div
        className="integrity-panel-clip"
        id={disclosureId}
        role="region"
        aria-labelledby={labelId}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="integrity-panel">
          <div className="integrity-panel-heading">
            <div>
              <span className="integrity-eyebrow" id={labelId}>SHA-256 HASH</span>
              <span className={`integrity-state${available ? "" : " is-unavailable"}`}>
                {available ? "Reference digest stored" : "Hash unavailable"}
              </span>
            </div>
            {available && (
              <button className="integrity-copy-button" type="button" onClick={copyHash}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M5.5 5.5h7v8h-7zM3.5 10.5h-1v-8h7v1" />
                </svg>
                Copy hash
              </button>
            )}
          </div>

          {available ? (
            <code className="integrity-hash">{hash}</code>
          ) : (
            <p className="integrity-unavailable-copy">
              No SHA-256 reference digest was returned for this file.
            </p>
          )}

          <p className="integrity-explanation">
            This stored digest represents the original file contents. Its presence alone does not verify the file's current integrity.
          </p>
          <span className="integrity-copy-feedback" role="status" aria-live="polite">
            {copyStatus}
          </span>
        </div>
      </div>
    </section>
  );
}
