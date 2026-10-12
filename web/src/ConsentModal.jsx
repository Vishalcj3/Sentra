import React, { useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase.js";
import SignatureCapture from "./SignatureCapture.jsx";
import { PinVerify, PinSetup } from "./PinAuth.jsx";

const SCOPE_LABELS = {
  view_history:      { icon: "📋", label: "View medical history" },
  add_prescription:  { icon: "💊", label: "Add a prescription" },
  view_labs:         { icon: "🔬", label: "View lab results" },
};

/*
  ConsentModal handles ALL authentication modes for consent approval:
  - hasSignature + hasPIN: show tab picker (sig | pin)
  - hasSignature only:     show sig capture (with switch to pin setup)
  - hasPIN only:           show pin verify (with switch to sig capture)
  - neither:               show setup choice (draw sig | create pin)
*/
export default function ConsentModal({ consent, patientId, patientProfile, onClose, onApproved }) {
  const [authMode, setAuthMode] = useState(
    patientProfile?.signatureUrl ? "signature"
    : patientProfile?.pinHash   ? "pin"
    : "setup"
  );
  const [setupChoice, setSetupChoice] = useState(null); // "signature" | "pin"
  const [status, setStatus] = useState("idle"); // "idle" | "submitting" | "success"
  const [error, setError] = useState("");

  const hasSignature = !!patientProfile?.signatureUrl;
  const hasPin = !!patientProfile?.pinHash;
  const hasBoth = hasSignature && hasPin;

  const scopeInfo = SCOPE_LABELS[consent.scope] || { icon: "🔐", label: consent.scope };

  // ── Signature approved ────────────────────────────────────
  const handleSignatureCapture = async (blob) => {
    setStatus("submitting");
    setError("");
    try {
      // Upload consent-specific signature as evidence
      const storePath = `consent-signatures/${patientId}/${consent.id}.png`;
      const storageRef = ref(storage, storePath);
      await uploadBytes(storageRef, blob);
      const sigUrl = await getDownloadURL(storageRef);

      // If first-time signature, also save as patient's registered signature
      if (!hasSignature) {
        const profileSigRef = ref(storage, `signatures/${patientId}.png`);
        await uploadBytes(profileSigRef, blob);
        const profileSigUrl = await getDownloadURL(profileSigRef);
        await updateDoc(doc(db, "patients", patientId), { signatureUrl: profileSigUrl });
      }

      await approveConsent({ consentSignatureUrl: sigUrl });
    } catch (err) {
      setError("Upload failed. Please try again.");
      setStatus("idle");
    }
  };

  // ── PIN approved ──────────────────────────────────────────
  const handlePinSuccess = async () => {
    setStatus("submitting");
    await approveConsent({});
  };

  // ── PIN setup + approve ───────────────────────────────────
  const handlePinSetupComplete = async (pinHash) => {
    setStatus("submitting");
    try {
      await updateDoc(doc(db, "patients", patientId), { pinHash });
      await approveConsent({});
    } catch (err) {
      setError("Failed to save PIN. Please try again.");
      setStatus("idle");
    }
  };

  // ── Core approval ─────────────────────────────────────────
  const approveConsent = async (extra) => {
    try {
      await updateDoc(doc(db, "consents", consent.id), {
        approved: true,
        approvedAt: serverTimestamp(),
        ...extra,
      });
      setStatus("success");
      setTimeout(() => onApproved(), 1500);
    } catch (err) {
      setError("Failed to record approval. Please try again.");
      setStatus("idle");
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-drag-handle" />

        {status === "success" ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
            <p className="modal-title">Access granted</p>
            <p className="modal-sub">
              {consent.providerName || "The provider"} can now {scopeInfo.label.toLowerCase()}.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <p className="modal-title">Document access request</p>
            <p className="modal-sub">
              <strong>{consent.providerName || `Provider ${consent.providerId}`}</strong>
              {" "}from <em>{consent.orgName || "—"}</em> is requesting access to your records.
            </p>

            <div className="consent-scope-pill">
              <span>{scopeInfo.icon}</span>
              <span>{scopeInfo.label}</span>
            </div>

            <div className="consent-alert">
              <p className="consent-alert-title">⚠ Your signature or PIN is required</p>
              <p className="consent-alert-sub">
                Approving grants access until {consent.expiresAt?.toDate
                  ? consent.expiresAt.toDate().toLocaleDateString()
                  : "the specified expiry"}.
              </p>
            </div>

            {error && (
              <div className="auth-error" style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA", marginBottom: 12 }}>
                {error}
              </div>
            )}

            {/* Auth method tabs (only if patient has both methods) */}
            {hasBoth && (
              <div className="auth-method-tabs">
                <button
                  className={`auth-method-tab ${authMode === "signature" ? "active" : ""}`}
                  onClick={() => setAuthMode("signature")}
                >
                  ✍️ Signature
                </button>
                <button
                  className={`auth-method-tab ${authMode === "pin" ? "active" : ""}`}
                  onClick={() => setAuthMode("pin")}
                >
                  🔢 PIN
                </button>
              </div>
            )}

            {/* ── SIGNATURE MODE ── */}
            {(authMode === "signature" || (authMode === "setup" && setupChoice === "signature")) &&
              status !== "submitting" && (
                <SignatureCapture
                  referenceUrl={patientProfile?.signatureUrl}
                  onCapture={handleSignatureCapture}
                  onCancel={
                    !hasPin
                      ? () => { setAuthMode("setup"); setSetupChoice(null); }
                      : () => setAuthMode("pin")
                  }
                />
              )}

            {/* ── PIN VERIFY MODE ── */}
            {authMode === "pin" && status !== "submitting" && (
              <PinVerify
                storedHash={patientProfile.pinHash}
                onSuccess={handlePinSuccess}
                onSwitchToSig={
                  !hasSignature ? null : () => setAuthMode("signature")
                }
              />
            )}

            {/* ── SETUP CHOICE (no sig + no pin) ── */}
            {authMode === "setup" && !setupChoice && status !== "submitting" && (
              <>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                  Set up identity verification to approve requests:
                </p>
                <div className="setup-choice">
                  <button className="setup-choice-btn" onClick={() => setSetupChoice("signature")}>
                    <span className="icon">✍️</span>
                    <span>Draw signature</span>
                  </button>
                  <button className="setup-choice-btn" onClick={() => setSetupChoice("pin")}>
                    <span className="icon">🔢</span>
                    <span>Create PIN</span>
                  </button>
                </div>
                <p className="pin-confirm-note">
                  This is saved to your profile and required for all future access approvals.
                </p>
              </>
            )}

            {/* ── PIN SETUP MODE ── */}
            {authMode === "setup" && setupChoice === "pin" && status !== "submitting" && (
              <PinSetup
                onComplete={handlePinSetupComplete}
                onSkip={() => setSetupChoice(null)}
              />
            )}

            {status === "submitting" && (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div className="spinner" style={{ margin: "0 auto 12px" }} />
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Recording approval…</p>
              </div>
            )}

            <button
              className="ghost"
              onClick={onClose}
              style={{ width: "100%", marginTop: 16 }}
              disabled={status === "submitting"}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
