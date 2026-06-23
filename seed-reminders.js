// seed-reminders.js
// Real-timing dummy data to watch every Hermes reminder fire WITHOUT demo mode.
// Run with: node seed-reminders.js   (needs serviceAccountKey.json in this folder)
//
// Seeds for patient `demo-patient-clean`:
//   - a prescription (metformin 500mg)
//   - appointment A ~25 min out → token_reminder + appointment_reminder fire next tick
//   - appointment B ~20 h out   → appointment_reminder fires next tick
//   - a dose schedule at ~1 min ago (IST) → dose_reminder fires next tick (within grace)
//   - a followup due now          → followup_reminder fires next tick
//
// DEMO_MODE is false, so these rely on real lead/grace windows. Re-run right
// before testing — timestamps are relative to "now" at seed time. Hermes runs
// every 1 minute, so allow up to a minute for the notifications to appear.

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const TS = admin.firestore.Timestamp;

const TZ = "Asia/Kolkata"; // patient's local zone for dose times

// Local 24h HH:mm for a given instant in a timezone.
function localHHmm(date, timeZone) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.hour}:${p.minute}`;
}

async function seed() {
  const now = Date.now();
  const batch = db.batch();

  // Provider + patient (idempotent fixed IDs)
  batch.set(db.collection("providers").doc("demo-doctor-1"), {
    name: "Dr. Anitha Raman",
    role: "doctor",
    orgName: "VORTEXA Demo Clinic",
    createdAt: new Date(),
  });
  batch.set(db.collection("patients").doc("demo-patient-clean"), {
    name: "Karthik S",
    phone: "9999900001",
    dob: "1990-04-12",
    allergies: [],
    currentMeds: ["metformin"],
    createdAt: new Date(),
  });

  // Prescription
  batch.set(db.collection("prescriptions").doc("demo-prescription-seed"), {
    patientId: "demo-patient-clean",
    providerId: "demo-doctor-1",
    drugName: "metformin",
    dosage: "500mg",
    frequency: "twice daily",
    durationDays: 30,
    createdAt: new Date(),
  });

  // Appointment A — ~25 min out: token_reminder (30min lead) + appointment_reminder (24h lead)
  batch.set(db.collection("appointments").doc("demo-appt-soon"), {
    patientId: "demo-patient-clean",
    providerId: "demo-doctor-1",
    scheduledAt: TS.fromDate(new Date(now + 25 * 60 * 1000)),
    tokenNumber: 1,
    status: "booked",
    reminderSentAt: null,
    apptReminderSentAt: null,
    createdAt: new Date(),
  });

  // Appointment B — ~20 h out: only appointment_reminder fires
  batch.set(db.collection("appointments").doc("demo-appt-tomorrow"), {
    patientId: "demo-patient-clean",
    providerId: "demo-doctor-1",
    scheduledAt: TS.fromDate(new Date(now + 20 * 60 * 60 * 1000)),
    tokenNumber: 2,
    status: "booked",
    reminderSentAt: null,
    apptReminderSentAt: null,
    createdAt: new Date(),
  });

  // Dose schedule — a time ~1 min ago in IST so it fires immediately (within grace)
  const doseTime = localHHmm(new Date(now - 60 * 1000), TZ);
  batch.set(db.collection("doseSchedules").doc("demo-dose-1"), {
    patientId: "demo-patient-clean",
    prescriptionId: "demo-prescription-seed",
    drugName: "metformin",
    dosage: "500mg",
    times: [doseTime],
    timezone: TZ,
    active: true,
    startDate: null,
    endDate: null,
    lastFiredAt: null,
    createdAt: new Date(),
  });

  // Followup — due now
  batch.set(db.collection("followups").doc("demo-followup-1"), {
    patientId: "demo-patient-clean",
    prescriptionId: "demo-prescription-seed",
    dueAt: TS.fromDate(new Date(now - 1000)),
    type: "checkup_reminder",
    status: "pending",
    sentAt: null,
  });

  // Historical dose logs so the adherence summary has data immediately.
  const dayMs = 24 * 60 * 60 * 1000;
  const history = [
    { offset: 1, status: "taken" },
    { offset: 2, status: "taken" },
    { offset: 3, status: "missed" },
    { offset: 4, status: "taken" },
    { offset: 5, status: "snoozed" },
  ];
  history.forEach((h, i) => {
    const at = new Date(now - h.offset * dayMs);
    const acted = h.status === "taken" || h.status === "snoozed";
    batch.set(db.collection("doseLogs").doc(`demo-dose-1__hist${i}`), {
      patientId: "demo-patient-clean",
      doseScheduleId: "demo-dose-1",
      prescriptionId: "demo-prescription-seed",
      drugName: "metformin",
      dosage: "500mg",
      scheduledFor: TS.fromDate(at),
      status: h.status,
      actedAt: acted ? TS.fromDate(at) : null,
      createdAt: new Date(),
    });
  });

  await batch.commit();

  console.log("Dummy reminder data seeded for patient demo-patient-clean.");
  console.log(`Dose time set to ${doseTime} (${TZ}) — fires on the next Hermes tick.`);
  console.log("Within ~1 min you should see new docs in `notifications`:");
  console.log("  - token_reminder        (appointment A, ~25 min out)");
  console.log("  - appointment_reminder  (appointment A and appointment B)");
  console.log("  - dose_reminder         (metformin 500mg)");
  console.log("  - followup_reminder     (checkup)");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
