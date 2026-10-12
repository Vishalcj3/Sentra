import React, { useEffect, useState } from "react";
import {
  collection, doc, addDoc, onSnapshot, query, where, orderBy,
  getDocs, limit, serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase.js";
import RagSources from "./RagSources.jsx";
import AppointmentPicker from "./AppointmentPicker.jsx";

const createFollowupFn = httpsCallable(functions, "createFollowup");
const bookAppointmentFn = httpsCallable(functions, "bookAppointment");

const ROLE_COLORS = {
  doctor:     { bg: "var(--indigo-tint)", text: "var(--indigo)" },
  pharmacist: { bg: "var(--accent-tint)", text: "#047857" },
  lab:        { bg: "var(--warning-tint)", text: "#92400E" },
};
const ROLE_ICONS = { doctor: "👨‍⚕️", pharmacist: "💊", lab: "🔬" };

const SCOPE_OPTIONS = [
  { value: "view_history",     label: "View medical history" },
  { value: "add_prescription", label: "Add prescription" },
  { value: "view_labs",        label: "View lab results" },
];

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

export default function DoctorApp({ user, profile, onSignOut }) {
  const providerId = user.uid;
  const role = profile?.role || "doctor";
  const roleStyle = ROLE_COLORS[role] || ROLE_COLORS.doctor;

  const [tab, setTab] = useState("patients");
  const [appointments, setAppointments] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "appointments"), where("providerId", "==", providerId), orderBy("scheduledAt", "asc"));
    return onSnapshot(q, (snap) => setAppointments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [providerId]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const navTabs = [
    { id: "patients", icon: "🔍", label: "Patients" },
    ...(role === "doctor" ? [{ id: "prescribe", icon: "💊", label: "Prescribe" }] : []),
    { id: "queue", icon: "🏥", label: "Queue" },
  ];

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <div className="topbar-title">{profile?.name || "Provider"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span className="topbar-role-badge" style={{ background: roleStyle.bg, color: roleStyle.text }}>
              {ROLE_ICONS[role]} {profile?.role || role}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{profile?.orgName}</span>
          </div>
        </div>
        <button className="ghost" onClick={onSignOut} style={{ fontSize: 13, padding: "6px 14px" }}>Sign out</button>
      </div>

      <div className="content">
        {tab === "patients" && <PatientsTab providerId={providerId} providerName={profile?.name} orgName={profile?.orgName} onToast={showToast} />}
        {tab === "prescribe" && <PrescribeTab providerId={providerId} onToast={showToast} />}
        {tab === "queue" && <QueueTab appointments={appointments} providerId={providerId} onToast={showToast} />}
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="nav-tabs">
        {navTabs.map((t) => (
          <button key={t.id} className={`nav-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <span className="nav-icon">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── PATIENTS TAB ────────────────────────────────────────── */
function PatientsTab({ providerId, providerName, orgName, onToast }) {
  const [query_, setQuery_] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [consents, setConsents] = useState([]);
  const [requesting, setRequesting] = useState(false);
  const [requestScope, setRequestScope] = useState("view_history");
  const [patientStats, setPatientStats] = useState(null);

  const searchPatients = async () => {
    if (!query_.trim()) return;
    setLoading(true);
    try {
      const byPhone = await getDocs(query(collection(db, "patients"), where("phone", "==", query_.trim()), limit(5)));
      const byName  = await getDocs(query(collection(db, "patients"), where("name", ">=", query_), where("name", "<=", query_ + ""), limit(5)));
      const combined = new Map();
      [...byPhone.docs, ...byName.docs].forEach((d) => combined.set(d.id, { id: d.id, ...d.data() }));
      setResults([...combined.values()]);
    } finally {
      setLoading(false);
    }
  };

  const selectPatient = async (patient) => {
    setSelectedPatient(patient);
    const pq = query(collection(db, "prescriptions"), where("patientId", "==", patient.id), orderBy("createdAt", "desc"));
    onSnapshot(pq, (snap) => setPrescriptions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const cq = query(collection(db, "consents"), where("patientId", "==", patient.id), where("providerId", "==", providerId));
    onSnapshot(cq, (snap) => setConsents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));

    const [apptSnap, rxSnap, consentSnap] = await Promise.all([
      getDocs(query(collection(db, "appointments"), where("patientId", "==", patient.id), where("providerId", "==", providerId))),
      getDocs(query(collection(db, "prescriptions"), where("patientId", "==", patient.id), where("providerId", "==", providerId))),
      getDocs(query(collection(db, "consents"), where("patientId", "==", patient.id), where("providerId", "==", providerId))),
    ]);
    setPatientStats({ visits: apptSnap.size, prescriptions: rxSnap.size, consents: consentSnap.size });
  };

  const requestAccess = async () => {
    setRequesting(true);
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await addDoc(collection(db, "consents"), {
        patientId: selectedPatient.id, providerId,
        providerName: providerName || providerId,
        orgName: orgName || "",
        scope: requestScope,
        approved: false, approvedAt: null, expiresAt,
        requestedAt: new Date(),
      });
      onToast("Access request sent — patient will be notified.");
    } catch (err) {
      onToast("Failed to send request: " + err.message);
    } finally {
      setRequesting(false);
    }
  };

  const approvedConsent = consents.find((c) => c.approved && c.scope === requestScope);
  const pendingConsent  = consents.find((c) => !c.approved && c.scope === requestScope);

  if (selectedPatient) {
    return (
      <>
        <button className="back-btn-dark" onClick={() => { setSelectedPatient(null); setPrescriptions([]); setConsents([]); setPatientStats(null); }}>← All patients</button>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="avatar" style={{ background: avatarGradient(selectedPatient.name) }}>
            {initials(selectedPatient.name)}
          </div>
          <div style={{ flex: 1 }}>
            <div className="card-title" style={{ fontSize: 16 }}>{selectedPatient.name}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {selectedPatient.dob && (
                <span className="badge badge-info">🗓 {selectedPatient.dob}</span>
              )}
              <span className="badge badge-pending">Patient</span>
            </div>
            <div className="card-sub" style={{ marginBottom: 0, marginTop: 4, fontSize: 12 }}>{selectedPatient.phone || selectedPatient.email || "No contact"}</div>
          </div>
        </div>

        {patientStats && (
          <div className="stat-row">
            <div className="stat-box">
              <div className="stat-box-number">{patientStats.visits}</div>
              <div className="stat-box-label">Total Visits</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-number">{patientStats.prescriptions}</div>
              <div className="stat-box-label">Prescriptions</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-number">{patientStats.consents}</div>
              <div className="stat-box-label">Consents</div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-title">📋 Request document access</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Patient's signature or PIN is required to grant access.</p>
          <div className="field">
            <label className="label">Access scope</label>
            <select value={requestScope} onChange={(e) => setRequestScope(e.target.value)}>
              {SCOPE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {approvedConsent ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--accent-tint)", borderRadius: "var(--radius-sm)" }}>
              <span>✅</span>
              <span style={{ fontSize: 13, color: "#047857", fontWeight: 500 }}>Access granted · expires {approvedConsent.expiresAt?.toDate?.().toLocaleDateString()}</span>
            </div>
          ) : pendingConsent ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--warning-tint)", borderRadius: "var(--radius-sm)" }}>
              <span>⏳</span>
              <span style={{ fontSize: 13, color: "#B45309", fontWeight: 500 }}>Pending patient approval — waiting for signature/PIN</span>
            </div>
          ) : (
            <button className="primary primary-full" onClick={requestAccess} disabled={requesting}>
              {requesting ? "Sending request…" : "📤 Request access (requires patient auth)"}
            </button>
          )}
        </div>

        {approvedConsent && (
          <>
            <div className="section-label">Prescription history</div>
            {prescriptions.length === 0 && <div className="empty-state"><span className="empty-state-icon">💊</span>No prescriptions yet.</div>}
            {prescriptions.map((p) => <PrescriptionCard key={p.id} p={p} />)}
          </>
        )}
      </>
    );
  }

  return (
    <>
      <div className="section-label">Find a patient</div>
      <div className="search-bar">
        <input placeholder="Name or phone number…" value={query_} onChange={(e) => setQuery_(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchPatients()} />
        <button className="primary" onClick={searchPatients} disabled={loading}>{loading ? "…" : "Search"}</button>
      </div>
      {results.length === 0 && query_ && !loading && <div className="empty-state">No patients found for "{query_}".</div>}
      {results.map((p) => (
        <div key={p.id} className="patient-card" onClick={() => selectPatient(p)}>
          <div className="avatar-sm" style={{ background: avatarGradient(p.name) }}>
            {initials(p.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{p.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{p.phone || p.email || "No contact"}</div>
            {p.dob && (
              <span className="badge badge-info" style={{ marginTop: 4, display: 'inline-flex' }}>🗓 {p.dob}</span>
            )}
          </div>
          <span style={{ color: "var(--text-muted)", fontSize: 20, flexShrink: 0 }}>›</span>
        </div>
      ))}
      {results.length === 0 && !query_ && <div className="empty-state"><span className="empty-state-icon">🔍</span>Search by patient name or phone to get started.</div>}
    </>
  );
}

/* ── PRESCRIBE TAB ───────────────────────────────────────── */
const EMPTY_ITEM = () => ({ drugName: "", dosage: "", frequency: "", durationDays: 7 });

function PrescribeTab({ providerId, onToast }) {
  const [patientId, setPatientId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [items, setItems] = useState([EMPTY_ITEM()]);
  const [checking, setChecking] = useState(false);
  const [prescriptions, setPrescriptions] = useState([]);

  useEffect(() => {
    if (!patientId) return;
    const q = query(collection(db, "prescriptions"), where("patientId", "==", patientId), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => setPrescriptions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [patientId]);

  const searchPatients = async () => {
    if (!patientSearch.trim()) return;
    const byPhone = await getDocs(query(collection(db, "patients"), where("phone", "==", patientSearch.trim()), limit(5)));
    const byName  = await getDocs(query(collection(db, "patients"), where("name", ">=", patientSearch), where("name", "<=", patientSearch + ""), limit(5)));
    const combined = new Map();
    [...byPhone.docs, ...byName.docs].forEach((d) => combined.set(d.id, { id: d.id, ...d.data() }));
    setPatientResults([...combined.values()]);
  };

  const pickPatient = (p) => { setSelectedPatient(p); setPatientId(p.id); setPatientResults([]); setPatientSearch(""); };

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const addItem = () => setItems((prev) => [...prev, EMPTY_ITEM()]);

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const prescribeAll = async () => {
    const validItems = items.filter((it) => it.drugName.trim());
    if (!patientId || validItems.length === 0) return;
    setChecking(true);
    try {
      await Promise.all(validItems.map(async (item) => {
        const ref = await addDoc(collection(db, "prescriptions"), {
          patientId, providerId,
          drugName: item.drugName.toLowerCase().trim(),
          dosage: item.dosage,
          frequency: item.frequency,
          durationDays: Number(item.durationDays) || 7,
          createdAt: new Date(),
          safetyCheck: { status: "pending", reasoning: "", interactions: [], checkedAt: null },
        });
        await createFollowupFn({ patientId, prescriptionId: ref.id, daysFromNow: Number(item.durationDays) || 7, type: "checkup_reminder" });
      }));
      setItems([EMPTY_ITEM()]);
      onToast(`${validItems.length} prescription(s) added — safety check running…`);
    } catch (err) {
      onToast("Error: " + err.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-title">New prescription</div>

        {selectedPatient ? (
          <div style={{ padding: "8px 12px", background: "var(--primary-tint)", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 }}>
            👤 {selectedPatient.name}
            <button className="ghost" onClick={() => { setSelectedPatient(null); setPatientId(""); }} style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px" }}>Change</button>
          </div>
        ) : (
          <div className="field">
            <label className="label">Patient</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchPatients()} placeholder="Name or phone…" style={{ flex: 1 }} />
              <button className="primary" onClick={searchPatients} style={{ whiteSpace: "nowrap" }}>Search</button>
            </div>
            {patientResults.map((p) => (
              <div key={p.id} className="list-item" style={{ cursor: "pointer", marginTop: 4 }} onClick={() => pickPatient(p)}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div className="timestamp">{p.phone || p.email}</div>
                </div>
                <span style={{ color: "var(--primary)", fontSize: 13 }}>Select</span>
              </div>
            ))}
          </div>
        )}

        {items.map((item, idx) => (
          <div key={idx} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px", marginBottom: 10, position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Drug {idx + 1}</span>
              {items.length > 1 && (
                <button className="ghost" onClick={() => removeItem(idx)} style={{ fontSize: 11, padding: "2px 8px", color: "var(--danger)" }}>Remove</button>
              )}
            </div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label className="label">Drug name</label>
              <input value={item.drugName} onChange={(e) => updateItem(idx, "drugName", e.target.value)} placeholder="e.g. aspirin" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Dosage</label>
                <input value={item.dosage} onChange={(e) => updateItem(idx, "dosage", e.target.value)} placeholder="75mg" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Duration (days)</label>
                <input type="number" value={item.durationDays} onChange={(e) => updateItem(idx, "durationDays", e.target.value)} />
              </div>
            </div>
            <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
              <label className="label">Frequency</label>
              <input value={item.frequency} onChange={(e) => updateItem(idx, "frequency", e.target.value)} placeholder="e.g. once daily" />
            </div>
          </div>
        ))}

        <button className="ghost" onClick={addItem} style={{ width: "100%", marginBottom: 10, border: "1px dashed var(--border)", borderRadius: "var(--radius)" }}>
          + Add Item
        </button>

        <button className="primary primary-full" disabled={!patientId || items.every((it) => !it.drugName.trim()) || checking} onClick={prescribeAll}>
          {checking ? "Running safety checks…" : `Prescribe ${items.filter((i) => i.drugName).length || ""} item(s) & run safety check`}
        </button>
      </div>

      {prescriptions.length > 0 && (
        <>
          <div className="section-label">Recent prescriptions</div>
          {prescriptions.map((p) => <PrescriptionCard key={p.id} p={p} />)}
        </>
      )}
    </>
  );
}

/* ── QUEUE TAB ───────────────────────────────────────────── */
function QueueTab({ appointments, providerId, onToast }) {
  const [showAdd, setShowAdd]           = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [picked, setPicked]             = useState(null);
  const [booking, setBooking]           = useState(false);

  const today = appointments.filter((a) => {
    if (!a.scheduledAt?.toDate) return false;
    return a.scheduledAt.toDate().toDateString() === new Date().toDateString();
  });

  const searchPatients = async () => {
    if (!patientSearch.trim()) return;
    const byPhone = await getDocs(query(collection(db, 'patients'), where('phone', '==', patientSearch.trim()), limit(5)));
    const byName  = await getDocs(query(collection(db, 'patients'), where('name', '>=', patientSearch), where('name', '<=', patientSearch + ''), limit(5)));
    const combined = new Map();
    [...byPhone.docs, ...byName.docs].forEach((d) => combined.set(d.id, { id: d.id, ...d.data() }));
    setPatientResults([...combined.values()]);
  };

  const addAppointment = async () => {
    if (!selectedPatient || !picked) return;
    setBooking(true);
    try {
      const res = await bookAppointmentFn({ patientId: selectedPatient.id, providerId, scheduledAt: picked.date.toISOString() });
      onToast('Appointment added - token #' + res.data.tokenNumber);
      setShowAdd(false);
      setSelectedPatient(null);
      setPicked(null);
      setPatientSearch('');
      setPatientResults([]);
    } catch (err) {
      onToast('Failed: ' + err.message);
    } finally {
      setBooking(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className='section-label' style={{ margin: 0 }}>Today's queue ({today.length})</div>
        <button className='primary' onClick={() => { setShowAdd((v) => !v); setPicked(null); setSelectedPatient(null); }} style={{ fontSize: 12, padding: '6px 14px' }}>
          {showAdd ? 'Cancel' : '+ Add Appointment'}
        </button>
      </div>

      {showAdd && (
        <div className='card' style={{ marginTop: 8 }}>
          <div className='card-title'>Add Appointment</div>

          {selectedPatient ? (
            <div style={{ padding: '10px 12px', background: 'var(--primary-tint)', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{selectedPatient.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{selectedPatient.phone || selectedPatient.email}</div>
              <button className='ghost' onClick={() => { setSelectedPatient(null); setPicked(null); }} style={{ marginTop: 6, fontSize: 11, padding: '2px 8px' }}>Change patient</button>
            </div>
          ) : (
            <div className='field'>
              <label className='label'>Patient</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchPatients()} placeholder='Name or phone...' style={{ flex: 1 }} />
                <button className='primary' onClick={searchPatients} style={{ whiteSpace: 'nowrap' }}>Search</button>
              </div>
              {patientResults.map((p) => (
                <div key={p.id} className='list-item' style={{ cursor: 'pointer', marginTop: 4 }} onClick={() => { setSelectedPatient(p); setPatientResults([]); }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div className='timestamp'>{p.phone || p.email}</div>
                  </div>
                  <span style={{ color: 'var(--primary)', fontSize: 13 }}>Select</span>
                </div>
              ))}
            </div>
          )}

          {selectedPatient && (
            <AppointmentPicker doctorId={providerId} selected={picked} onSelect={setPicked} />
          )}

          {picked && (
            <button className='primary primary-full' disabled={booking} onClick={addAppointment} style={{ marginTop: 14 }}>
              {booking ? 'Adding...' : 'Confirm - ' + picked.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) + ' at ' + picked.slot}
            </button>
          )}
        </div>
      )}

      {today.length === 0 && !showAdd && (
        <div className='empty-state'><span className='empty-state-icon'>🏥</span>No appointments today.</div>
      )}

      {today.map((a) => (
        <div key={a.id} className='card'>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className='token-display'>#{a.tokenNumber}</div>
            <div style={{ textAlign: 'right' }}>
              <span className={'badge ' + (a.status === 'booked' ? 'badge-pending' : a.status === 'reminded' ? 'badge-info' : 'badge-clear')}>{a.status}</span>
              <div className='timestamp' style={{ marginTop: 6 }}>{a.scheduledAt?.toDate?.().toLocaleTimeString()}</div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function PrescriptionCard({ p }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="card-title" style={{ textTransform: "capitalize" }}>{p.drugName}</div>
          <div className="card-sub" style={{ marginBottom: 0 }}>{p.dosage} · {p.frequency} · {p.durationDays}d</div>
        </div>
        <StatusBadge status={p.safetyCheck?.status} />
      </div>
      {p.safetyCheck?.reasoning && <div className="reasoning-block">{p.safetyCheck.reasoning}</div>}
      {p.safetyCheck?.interactions?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {p.safetyCheck.interactions.map((i, idx) => <div key={idx} style={{ fontSize: 12, color: "var(--danger)", marginBottom: 2 }}>⚠ {i}</div>)}
        </div>
      )}
      <RagSources sources={p.safetyCheck?.sources} retrievedCount={p.safetyCheck?.retrievedCount} />
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return <span className="badge badge-pending">checking</span>;
  const cls = status === "flagged" ? "badge-flagged" : status === "clear" ? "badge-clear" : "badge-pending";
  return <span className={`badge ${cls}`}><span className={`status-dot dot-${status}`} />{status}</span>;
}
