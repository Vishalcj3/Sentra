import React, { useState, useRef, useEffect } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  sendSignInLinkToEmail,
} from "firebase/auth";
import { auth } from "./firebase.js";

const ACTION_CODE_URL = `${window.location.origin}/app`;

function OtpInput({ value, onChange, length = 6 }) {
  const refs = useRef([]);

  const digits = Array.from({ length }, (_, i) => value[i] || "");

  const handleChange = (idx, e) => {
    const d = e.target.value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = d;
    onChange(next.join(""));
    if (d && idx < length - 1) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < length - 1) refs.current[idx + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    onChange(pasted.padEnd(length, "").slice(0, length));
    const focusIdx = Math.min(pasted.length, length - 1);
    refs.current[focusIdx]?.focus();
  };

  return (
    <div className="otp-row">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={d}
          className="otp-box"
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  );
}

export default function AuthScreen() {
  const [method, setMethod] = useState("phone"); // "phone" | "email"
  const [step, setStep] = useState("input"); // "input" | "otp" | "email-sent"
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const confirmRef = useRef(null);
  const recaptchaRef = useRef(null);

  // Cleanup recaptcha on unmount
  useEffect(() => {
    return () => {
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch {}
        recaptchaRef.current = null;
        delete window.recaptchaVerifier;
      }
    };
  }, []);

  const initRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        { size: "invisible" }
      );
      recaptchaRef.current = window.recaptchaVerifier;
    }
    return window.recaptchaVerifier;
  };

  const sendPhoneOtp = async () => {
    setError("");
    const fullPhone = countryCode + phone.replace(/\s/g, "");
    if (!/^\+\d{7,15}$/.test(fullPhone)) {
      setError("Enter a valid phone number.");
      return;
    }
    setLoading(true);
    try {
      const verifier = initRecaptcha();
      const result = await signInWithPhoneNumber(auth, fullPhone, verifier);
      confirmRef.current = result;
      setStep("otp");
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
      try { recaptchaRef.current?.clear(); } catch {}
      recaptchaRef.current = null;
      delete window.recaptchaVerifier;
    } finally {
      setLoading(false);
    }
  };

  const verifyPhoneOtp = async () => {
    if (otp.length !== 6) { setError("Enter the 6-digit code."); return; }
    setLoading(true);
    setError("");
    try {
      await confirmRef.current.confirm(otp);
      // onAuthStateChanged in App.jsx takes over
    } catch (err) {
      setError("Invalid code. Please try again.");
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const sendEmailLink = async () => {
    if (!/\S+@\S+\.\S+/.test(email)) { setError("Enter a valid email address."); return; }
    setLoading(true);
    setError("");
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: ACTION_CODE_URL,
        handleCodeInApp: true,
      });
      localStorage.setItem("vortexaEmailForSignIn", email);
      setStep("email-sent");
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  const switchMethod = (m) => {
    setMethod(m);
    setStep("input");
    setError("");
    setOtp("");
  };

  return (
    <div className="auth-bg">
      {/* Hidden reCAPTCHA container */}
      <div id="recaptcha-container" />

      <div className="auth-logo">
        <div className="auth-logo-mark">V</div>
        <h1>VORTEXA</h1>
        <p>Patient-sovereign prescription intelligence</p>
      </div>

      <div className="auth-card">
        {step === "input" && (
          <>
            <h2>Sign in</h2>
            <p className="auth-sub">
              {method === "phone"
                ? "We'll send a one-time code to your number."
                : "We'll send a secure magic link to your email."}
            </p>

            <div className="auth-toggle">
              <button
                className={method === "phone" ? "active" : ""}
                onClick={() => switchMethod("phone")}
              >
                📱 Phone
              </button>
              <button
                className={method === "email" ? "active" : ""}
                onClick={() => switchMethod("email")}
              >
                ✉️ Email
              </button>
            </div>

            {error && <div className="auth-error">{error}</div>}

            {method === "phone" ? (
              <>
                <div className="field">
                  <label className="label">Phone number</label>
                  <div className="phone-row">
                    <input
                      className="phone-prefix"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      placeholder="+91"
                    />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                      onKeyDown={(e) => e.key === "Enter" && sendPhoneOtp()}
                    />
                  </div>
                </div>
                <button
                  className="primary"
                  onClick={sendPhoneOtp}
                  disabled={loading || !phone}
                >
                  {loading ? "Sending…" : "Send OTP →"}
                </button>
              </>
            ) : (
              <>
                <div className="field">
                  <label className="label">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    onKeyDown={(e) => e.key === "Enter" && sendEmailLink()}
                  />
                </div>
                <button
                  className="primary"
                  onClick={sendEmailLink}
                  disabled={loading || !email}
                >
                  {loading ? "Sending…" : "Send magic link →"}
                </button>
              </>
            )}

            <div className="auth-hint" style={{ marginTop: 20 }}>
              New users are automatically registered after sign-in.
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <button className="back-btn" onClick={() => { setStep("input"); setOtp(""); setError(""); }}>
              ← Back
            </button>
            <h2>Enter OTP</h2>
            <p className="auth-sub">
              Sent to {countryCode} {phone}
            </p>

            {error && <div className="auth-error">{error}</div>}

            <OtpInput value={otp} onChange={setOtp} />

            <button
              className="primary"
              onClick={verifyPhoneOtp}
              disabled={loading || otp.length !== 6}
            >
              {loading ? "Verifying…" : "Verify →"}
            </button>

            <button
              className="ghost"
              onClick={() => { setStep("input"); setOtp(""); setError(""); }}
            >
              Resend code
            </button>

            <div className="auth-hint">
              Didn't receive it? Check that your number is correct and try again.
            </div>
          </>
        )}

        {step === "email-sent" && (
          <>
            <div className="email-sent-icon">📬</div>
            <h2 style={{ textAlign: "center" }}>Check your email</h2>
            <p className="auth-sub" style={{ textAlign: "center" }}>
              A sign-in link has been sent to <strong style={{ color: "#fff" }}>{email}</strong>.
              Tap the link in your email to complete sign-in.
            </p>
            <button className="ghost" onClick={() => setStep("input")}>
              Use a different method
            </button>
            <div className="auth-hint">
              The link expires in 1 hour and can only be used once.
              {" "}If you're on a different device, open the link on this one.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
