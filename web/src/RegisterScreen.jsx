import React, { useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "./firebase.js";

const ROLES = [
  { id: "patient",     icon: "🧑‍⚕️", name: "Patient",      desc: "Manage my health records" },
  { id: "doctor",      icon: "👨‍⚕️", name: "Doctor",       desc: "Prescribe & manage patients" },
  { id: "pharmacist",  icon: "💊",   name: "Pharmacist",   desc: "Dispense & verify medications" },
  { id: "lab",         icon: "🔬",   name: "Lab Tech",     desc: "Upload & manage lab results" },
];

const SPECIALTIES = [
  "General Physician",
  "Cardiologist",
  "Neurologist",
  "Orthopedic",
  "Pediatrician",
  "Dermatologist",
  "ENT Specialist",
  "Psychiatrist",
  "Gynecologist",
  "Oncologist",
];

export default function RegisterScreen({ user, onComplete }) {
  const [role, setRole] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState(user?.phoneNumber?.replace(/^\+91/, "") || "");
  const [email, setEmail] = useState(user?.email || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isProvider = role && role !== "patient";

  const handleCreate = async () => {
    if (!role || !name.trim()) { setError("Choose a role and enter your name."); return; }
    if (isProvider && !orgName.trim()) { setError("Enter your organisation name."); return; }

    setLoading(true);
    setError("");

    try {
      const uid = user.uid;
      const base = {
        name: name.trim(),
        email: email || user.email || null,
        phone: phone || user.phoneNumber || null,
        createdAt: serverTimestamp(),
      };

      if (role === "patient") {
        await setDoc(doc(db, "patients", uid), {
          ...base,
          dob: dob || null,
          allergies: [],
          currentMeds: [],
          pinHash: null,
          signatureUrl: null,
        });
      } else {
        await setDoc(doc(db, "providers", uid), {
          ...base,
          role,
          orgName: orgName.trim(),
          specialty: specialty || null,
        });
      }

      onComplete(role, { id: uid, ...base, role: role === "patient" ? undefined : role, specialty: specialty || null });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-bg">
      <div className="register-header">
        <h2>Set up your profile</h2>
        <p>Signed in as {user?.phoneNumber || user?.email}</p>
      </div>

      <div className="register-body">
        {error && (
          <div className="auth-error" style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" }}>
            {error}
          </div>
        )}

        <div className="section-label">I am a…</div>
        <div className="role-cards">
          {ROLES.map((r) => (
            <div
              key={r.id}
              className={`role-card ${role === r.id ? "selected" : ""}`}
              onClick={() => setRole(r.id)}
            >
              <span className="role-card-icon">{r.icon}</span>
              <span className="role-card-name">{r.name}</span>
              <span className="role-card-desc">{r.desc}</span>
            </div>
          ))}
        </div>

        {role && (
          <>
            <div className="field">
              <label className="label">Full name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Anitha Raman"
              />
            </div>

            {isProvider && (
              <>
                <div className="field">
                  <label className="label">Organisation / Hospital</label>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Apollo Hospital, Chennai"
                  />
                </div>

                <div className="field">
                  <label className="label">Specialty</label>
                  <select value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                    <option value="">Select specialty…</option>
                    {SPECIALTIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {role === "patient" && (
              <>
                <div className="field">
                  <label className="label">Date of birth</label>
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>

                {!user?.phoneNumber && (
                  <div className="field">
                    <label className="label">Phone number</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                    />
                  </div>
                )}
              </>
            )}

            <button
              className="primary primary-full"
              onClick={handleCreate}
              disabled={loading}
              style={{ marginTop: 8 }}
            >
              {loading ? "Creating profile…" : "Create profile →"}
            </button>
          </>
        )}

        <button
          className="ghost"
          onClick={() => signOut(auth)}
          style={{ width: "100%", marginTop: 12 }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
