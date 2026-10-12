import React, { useState } from "react";

/**
 * RagSources — collapsible panel showing the clinical knowledge chunks the
 * safety agent retrieved (via vector search) and cited for its verdict.
 * This is the "show your work" surface that makes the RAG visible to users.
 *
 * @param {Array<{ id, title, type, severity, score }>} sources
 */
export default function RagSources({ sources, retrievedCount }) {
  const [open, setOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="rag-sources">
      <div className="rag-sources-header" onClick={() => setOpen((o) => !o)}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="rag-pill">🔎 RAG</span>
          {sources.length} source{sources.length > 1 ? "s" : ""} cited
          {retrievedCount ? ` · ${retrievedCount} retrieved` : ""}
        </span>
        <span>{open ? "▲" : "▼"}</span>
      </div>

      {open &&
        sources.map((s) => (
          <div key={s.id} className="rag-source-item">
            <div className="rag-source-title">
              <span>{typeIcon(s.type)}</span>
              {s.title}
            </div>
            <div className="rag-source-meta">
              <span className="rag-type-tag">{(s.type || "").replace(/_/g, " ")}</span>
              {s.severity && (
                <span className={`sev-${s.severity}`} style={{ fontWeight: 600 }}>
                  {s.severity}
                </span>
              )}
              {typeof s.score === "number" && (
                <>
                  <div className="rag-score-bar">
                    <div
                      className="rag-score-fill"
                      style={{ width: `${Math.max(8, Math.min(100, s.score * 100))}%` }}
                    />
                  </div>
                  <span>{(s.score * 100).toFixed(0)}%</span>
                </>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

function typeIcon(type) {
  switch (type) {
    case "drug_interaction":         return "💊";
    case "allergy_contraindication": return "🧬";
    case "clinical_guideline":       return "📋";
    case "dosage_warning":           return "⚖️";
    case "lab_correlation":          return "🔬";
    default:                         return "📄";
  }
}
