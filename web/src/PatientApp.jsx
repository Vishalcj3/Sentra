import React, { useEffect, useState } from "react";
import {
  collection, doc, onSnapshot, query, where, orderBy,
  updateDoc, serverTimestamp, getDocs, limit,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, functions, storage } from "./firebase.js";
import ConsentModal from "./ConsentModal.jsx";
import { PinSetup } from "./PinAuth.jsx";
import SignatureCapture from "./SignatureCapture.jsx";
import RagSources from "./RagSources.jsx";
import AppointmentPicker from "./AppointmentPicker.jsx";

const bookAppointmentFn = httpsCallable(functions, "bookAppointment");

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#0891B2,#0E7490)',
  'linear-gradient(135deg,#7C3AED,#5B21B6)',
  'linear-gradient(135deg,#059669,#047857)',
  'linear-gradient(135deg,#DC2626,#B91C1C)',
  'linear-gradient(135deg,#D97706,#B45309)',
  'linear-gradient(135deg,#2563EB,#1D4ED8)',
];

function avatarGradient(name) {
  return AVATAR_GRADIENTS[(name?.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length];
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function PatientApp({ user, profile, onProfileUpdate, onSignOut }) {
  const patientId = user.uid;
  const [tab, setTab] = useState("vault");
  const [prescriptions, setPrescriptions] = useState([]);
  const [consents, setConsents] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);
  const [activeConsent, setActiveConsent] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "prescriptions"), where("patientId", "==", patientId), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => setPrescriptions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [patientId]);

  useEffect(() => {
    const q = query(collection(db, "consents"), where("patientId", "==", patientId), where("approved", "==", false));
    return onSnapshot(q, (snap) => setConsents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [patientId]);

  useEffect(() => {
    const q = query(collection(db, "appointments"), where("patientId", "==", patientId), orderBy("scheduledAt", "desc"));
    return onSnapshot(q, (snap) => setAppointments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [patientId]);

  useEffect(() => {
    const q = query(collection(db, "notifications"), where("patientId", "==", patientId), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNotifications(list);
      const newest = list[0];
      if (newest && !newest.read) showToast(newest.message);
    });
  }, [patientId]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 5000); };

  const bookAppointment = async (providerId, when) => {
    try {
      const res = await bookAppointmentFn({ patientId, providerId, scheduledAt: when });
      showToast(`Booked ✓  Your token is #${res.data.tokenNumber}`);
    } catch (err) {
      showToast("Booking failed: " + err.message);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <div className="topbar-title">{profile?.name || "Patient"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span className="topbar-role-badge role-patient">Patient</span>
          </div>
        </div>
        <button className="ghost" onClick={onSignOut} style={{ fontSize: 13, padding: "6px 14px" }}>Sign out</button>
      </div>

      <div className="content">
        {tab === "vault" && (
          <VaultTab profile={profile} prescriptions={prescriptions} consents={consents} patientId={patientId} onOpenConsent={setActiveConsent} onProfileUpdate={onProfileUpdate} />
        )}
        {tab === "appointments" && (
          <AppointmentsTab appointments={appointments} onBook={bookAppointment} patientId={patientId} />
        )}
        {tab === "alerts" && <AlertsTab notifications={notifications} patientId={patientId} />}
        {tab === "security" && <SecurityTab profile={profile} patientId={patientId} onProfileUpdate={onProfileUpdate} />}
      </div>

      {toast && <div className="toast">{toast}</div>}

      {activeConsent && (
        <ConsentModal
          consent={activeConsent}
          patientId={patientId}
          patientProfile={profile}
          onClose={() => setActiveConsent(null)}
          onApproved={() => { setActiveConsent(null); showToast("Access approved ✓"); }}
        />
      )}

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "vault" ? "active" : ""}`} onClick={() => setTab("vault")}>
          <span className="nav-icon">🗄️</span>Vault
        </button>
        <button className={`nav-tab ${tab === "appointments" ? "active" : ""}`} onClick={() => setTab("appointments")}>
          <span className="nav-icon">📅</span>Appointments
        </button>
        <button className={`nav-tab ${tab === "alerts" ? "active" : ""} notif-badge`} onClick={() => setTab("alerts")}>
          <span className="nav-icon">🔔</span>Alerts
          {unreadCount > 0 && <span className="notif-count">{unreadCount}</span>}
        </button>
        <button className={`nav-tab ${tab === "security" ? "active" : ""}`} onClick={() => setTab("security")}>
          <span className="nav-icon">🔐</span>Security
        </button>
      </div>
    </div>
  );
}

/* ── VAULT TAB ──────────────────────────────────────────── */
function VaultTab({ profile, prescriptions, consents, patientId, onOpenConsent, onProfileUpdate }) {
  return (
    <>
      {consents.length > 0 && (
        <div className="card" style={{ borderColor: "#F59E0B", background: "#FFFBEB" }}>
          <div className="card-title" style={{ color: "#92400E" }}>⚠ Access requests waiting for you ({consents.length})</div>
          <div className="card-sub" style={{ color: "#B45309" }}>Providers are requesting access to your medical records. Your signature or PIN is required.</div>
          {consents.map((c) => (
            <div key={c.id} className="list-item">
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.scope?.replace(/_/g, " ") || "Record access"}</div>
                <div className="timestamp" style={{ marginTop: 2 }}>Provider ID: {c.providerId?.slice(0, 8)}…</div>
              </div>
              <button className="primary" onClick={() => onOpenConsent(c)} style={{ fontSize: 12, padding: "8px 14px" }}>Review →</button>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-title">🧬 Allergies</div>
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {profile?.allergies?.length
            ? profile.allergies.map((a) => <span key={a} className="badge badge-flagged">{a}</span>)
            : <span className="card-sub" style={{ margin: 0 }}>None recorded</span>}
        </div>
      </div>

      <div className="card">
        <div className="card-title">💊 Current medications</div>
        {profile?.currentMeds?.length
          ? profile.currentMeds.map((m) => <div key={m} className="list-item"><span style={{ fontSize: 14 }}>{m}</span></div>)
          : <span className="card-sub">None recorded</span>}
      </div>

      <div className="section-label">Prescription history</div>
      {prescriptions.length === 0 && <div className="empty-state"><span className="empty-state-icon">💊</span>No prescriptions yet.</div>}
      {prescriptions.map((p) => (
        <div key={p.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="card-title" style={{ textTransform: "capitalize" }}>{p.drugName}</div>
              <div className="card-sub" style={{ marginBottom: 0 }}>{p.dosage} · {p.frequency} · {p.durationDays}d</div>
            </div>
            <StatusBadge status={p.safetyCheck?.status} />
          </div>
          {p.safetyCheck?.reasoning && <div className="reasoning-block">{p.safetyCheck.reasoning}</div>}
          <RagSources sources={p.safetyCheck?.sources} retrievedCount={p.safetyCheck?.retrievedCount} />
        </div>
      ))}
    </>
  );
}

/* ── APPOINTMENTS TAB ───────────────────────────────────── */
function AppointmentsTab({ appointments, onBook, patientId }) {
  const [doctors, setDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [picked, setPicked] = useState(null);
  const [doctorStats, setDoctorStats] = useState({});

  useEffect(() => {
    const fetchDoctors = async () => {
      setLoadingDoctors(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'providers'), where('role', '==', 'doctor'))
        );
        setDoctors(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } finally {
        setLoadingDoctors(false);
      }
    };
    fetchDoctors();
  }, []);

  const handleSelectDoctor = async (doctor) => {
    if (selectedDoctor?.id === doctor.id) {
      setSelectedDoctor(null);
      setPicked(null);
      return;
    }
    setSelectedDoctor(doctor);
    setPicked(null);

    const [apptSnap, rxSnap] = await Promise.all([
      getDocs(query(collection(db, 'appointments'), where('patientId', '==', patientId), where('providerId', '==', doctor.id))),
      getDocs(query(collection(db, 'prescriptions'), where('patientId', '==', patientId), where('providerId', '==', doctor.id))),
    ]);
    setDoctorStats((prev) => ({
      ...prev,
      [doctor.id]: { appointments: apptSnap.size, prescriptions: rxSnap.size },
    }));
  };

  const handleBook = () => {
    if (!selectedDoctor || !picked) return;
    onBook(selectedDoctor.id, picked.date.toISOString());
    setSelectedDoctor(null);
    setPicked(null);
  };

  return (
    <>
      <div className="section-label">Find a doctor</div>

      {loadingDoctors && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div className="spinner" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading doctors…</p>
        </div>
      )}

      {!loadingDoctors && doctors.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-icon">👨‍⚕️</span>
          No doctors available right now.
        </div>
      )}

      {doctors.map((doctor) => {
        const isExpanded = selectedDoctor?.id === doctor.id;
        const stats = doctorStats[doctor.id];
        return (
          <div
            key={doctor.id}
            className={`doctor-card ${isExpanded ? 'expanded' : ''}`}
            onClick={() => handleSelectDoctor(doctor)}
          >
            <div className="doctor-card-header">
              <div
                className="avatar"
                style={{ background: avatarGradient(doctor.name) }}
              >
                {initials(doctor.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 3 }}>
                  Dr. {doctor.name}
                </div>
                {doctor.specialty && (
                  <span className="specialty-badge">{doctor.specialty}</span>
                )}
                {!doctor.specialty && (
                  <span className="specialty-badge">General Physician</span>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{doctor.orgName}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span className="availability-chip">Available 10AM–6PM</span>
                <span style={{ fontSize: 18, color: 'var(--text-muted)', transition: 'transform .2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>›</span>
              </div>
            </div>

            {isExpanded && (
              <div className="doctor-card-inner" onClick={(e) => e.stopPropagation()}>
                {stats && (
                  <div className="stat-row">
                    <div className="stat-box">
                      <div className="stat-box-number">{stats.appointments}</div>
                      <div className="stat-box-label">Visits</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-box-number">{stats.prescriptions}</div>
                      <div className="stat-box-label">Rx</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-box-number" style={{ fontSize: 18 }}>✓</div>
                      <div className="stat-box-label">Active</div>
                    </div>
                  </div>
                )}

                <AppointmentPicker doctorId={doctor.id} selected={picked} onSelect={setPicked} />

                {picked && (
                  <button className="primary primary-full" onClick={handleBook} style={{ marginTop: 14 }}>
                    Book appointment with Dr. {doctor.name}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="section-label">Your appointments</div>
      {appointments.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-icon">📅</span>No appointments booked.
        </div>
      )}
      {appointments.map((a) => (
        <div key={a.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className='label' style={{ marginBottom: 2 }}>Token</div>
              <div className='token-display'>#{a.tokenNumber}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <StatusBadge status={a.status === 'booked' ? 'pending' : a.status === 'reminded' ? 'flagged' : 'clear'} label={a.status} />
              <div className='timestamp' style={{ marginTop: 6 }}>{a.scheduledAt?.toDate?.().toLocaleString()}</div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function AlertsTab({ notifications, patientId }) {
  const markRead = async (id) => { await updateDoc(doc(db, "notifications", id), { read: true }); };
  return (
    <>
      <div className="section-label">Notifications</div>
      {notifications.length === 0 && <div className="empty-state"><span className="empty-state-icon">🔔</span>No notifications yet — Hermes will alert you here.</div>}
      {notifications.map((n) => (
        <div key={n.id} className="card" style={!n.read ? { borderColor: "var(--primary)", background: "var(--primary-tint)" } : {}} onClick={() => !n.read && markRead(n.id)}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 20, flexShrink: 0 }}>{n.type === "safety_alert" ? "⚠️" : n.type === "token_reminder" ? "🏥" : "💊"}</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, margin: 0 }}>{n.message}</p>
              <div className="timestamp" style={{ marginTop: 4 }}>
                {n.createdAt?.toDate?.().toLocaleTimeString()}
                {!n.read && <span className="badge badge-info" style={{ marginLeft: 8 }}>New</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/* ── SECURITY TAB ───────────────────────────────────────── */
function SecurityTab({ profile, patientId, onProfileUpdate }) {
  const [view, setView] = useState("home");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const savePinHash = async (hash) => {
    setSaving(true);
    await updateDoc(doc(db, "patients", patientId), { pinHash: hash });
    onProfileUpdate({ pinHash: hash });
    setSaving(false);
    setView("home");
    setToast("PIN saved ✓");
    setTimeout(() => setToast(""), 3000);
  };

  const saveSignature = async (blob) => {
    setSaving(true);
    try {
      const storageRef = ref(storage, `signatures/${patientId}.png`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "patients", patientId), { signatureUrl: url });
      onProfileUpdate({ signatureUrl: url });
      setView("home");
      setToast("Signature saved ✓");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {toast && <div className="toast" style={{ position: "relative", bottom: 0, transform: "none", left: 0, marginBottom: 12 }}>{toast}</div>}
      {view === "home" && (
        <>
          <div className="section-label">Identity verification</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>Your signature and PIN are used to approve document access requests from providers.</p>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="card-title">✍️ Signature</div>
                <div className="card-sub" style={{ marginBottom: 0 }}>{profile?.signatureUrl ? "Registered ✓" : "Not set up"}</div>
              </div>
              <button className={profile?.signatureUrl ? "ghost" : "primary"} style={{ fontSize: 12, padding: "7px 14px" }} onClick={() => setView("sig-setup")}>
                {profile?.signatureUrl ? "Update" : "Set up"}
              </button>
            </div>
            {profile?.signatureUrl && <div style={{ marginTop: 12 }}><img src={profile.signatureUrl} alt="Your signature" style={{ border: "1px solid var(--border)", borderRadius: 8, maxWidth: "100%", background: "#fafbfc" }} /></div>}
          </div>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="card-title">🔢 PIN</div>
                <div className="card-sub" style={{ marginBottom: 0 }}>{profile?.pinHash ? "6-digit PIN set ✓" : "Not set up"}</div>
              </div>
              <button className={profile?.pinHash ? "ghost" : "primary"} style={{ fontSize: 12, padding: "7px 14px" }} onClick={() => setView("pin-setup")}>
                {profile?.pinHash ? "Change" : "Set up"}
              </button>
            </div>
          </div>
        </>
      )}
      {view === "pin-setup" && (<><button className="back-btn-dark" onClick={() => setView("home")}>← Back</button><PinSetup onComplete={savePinHash} /></>)}
      {view === "sig-setup" && (
        <>
          <button className="back-btn-dark" onClick={() => setView("home")}>← Back</button>
          <div className="card">
            <div className="card-title">Update signature</div>
            <div className="card-sub">Draw your signature clearly — it will be shown to you when approving access requests.</div>
            {saving ? <div style={{ textAlign: "center", padding: 24 }}><div className="spinner" style={{ margin: "0 auto 8px" }} /><p style={{ fontSize: 13, color: "var(--text-muted)" }}>Saving…</p></div>
              : <SignatureCapture onCapture={saveSignature} />}
          </div>
        </>
      )}
    </>
  );
}

function StatusBadge({ status, label }) {
  if (!status) return <span className="badge badge-pending">checking</span>;
  const cls = status === "flagged" ? "badge-flagged" : status === "clear" ? "badge-clear" : "badge-pending";
  return <span className={`badge ${cls}`}><span className={`status-dot dot-${status}`} />{label || status}</span>;
}
