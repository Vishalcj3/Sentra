import React, { useState, useEffect } from "react";

const PIN_LENGTH = 6;

async function sha256(str) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str + "vortexa-v1")
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ── PIN NUMPAD ──────────────────────────────────────────── */
function PinPad({ onComplete, title, subtitle, error }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (error) {
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 400);
    }
  }, [error]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) onComplete(pin);
  }, [pin]);

  const pressDigit = (d) => {
    if (pin.length < PIN_LENGTH) setPin((p) => p + d);
  };

  const del = () => setPin((p) => p.slice(0, -1));

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"];

  return (
    <div className="pin-screen">
      <p className="pin-title">{title}</p>
      {subtitle && <p className="pin-sub">{subtitle}</p>}

      <div className="pin-dots">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <div
            key={i}
            className={`pin-dot ${i < pin.length ? "filled" : ""} ${shake && i < PIN_LENGTH ? "error-dot" : ""}`}
          />
        ))}
      </div>

      {error && <p className="pin-error-msg">{error}</p>}

      <div className="numpad">
        {keys.map((k, i) => {
          if (k === "") return <div key={i} className="numpad-key empty" />;
          if (k === "⌫")
            return (
              <button key={i} className="numpad-key delete-key" onClick={del}>
                ⌫
              </button>
            );
          return (
            <button key={i} className="numpad-key" onClick={() => pressDigit(String(k))}>
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── PIN VERIFY (patient approving consent) ──────────────── */
export function PinVerify({ storedHash, onSuccess, onSwitchToSig }) {
  const [error, setError] = useState("");

  const handlePin = async (pin) => {
    const hash = await sha256(pin);
    if (hash === storedHash) {
      onSuccess();
    } else {
      setError("Incorrect PIN. Try again.");
    }
  };

  return (
    <div>
      <PinPad
        title="Enter your PIN"
        subtitle="Confirm your identity to approve this request"
        onComplete={handlePin}
        error={error}
      />
      {onSwitchToSig && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="link-btn" onClick={onSwitchToSig}>
            Use signature instead
          </button>
        </div>
      )}
    </div>
  );
}

/* ── PIN SETUP (first-time) ──────────────────────────────── */
export function PinSetup({ onComplete, onSkip }) {
  const [step, setStep] = useState("create"); // "create" | "confirm"
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");

  const handleFirst = (pin) => {
    setFirstPin(pin);
    setStep("confirm");
    setError("");
  };

  const handleConfirm = async (pin) => {
    if (pin !== firstPin) {
      setError("PINs don't match. Start over.");
      setStep("create");
      setFirstPin("");
      return;
    }
    const hash = await sha256(pin);
    onComplete(hash);
  };

  return (
    <div>
      {step === "create" ? (
        <PinPad
          title="Create a PIN"
          subtitle="You'll use this to approve document access requests"
          onComplete={handleFirst}
          error={error}
        />
      ) : (
        <PinPad
          title="Confirm your PIN"
          subtitle="Enter the same PIN again to confirm"
          onComplete={handleConfirm}
          error={error}
        />
      )}

      {step === "create" && onSkip && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="link-btn" onClick={onSkip}>
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}

export { sha256 };
