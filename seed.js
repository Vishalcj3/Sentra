// seed.js
// Run with: node seed.js
// Requires a serviceAccountKey.json in this folder (download from
// Firebase Console > Project Settings > Service Accounts > Generate key).
//
// Seeds:
//  - drugInteractions reference collection (from drugInteractions.json)
//  - 1 "clean" demo patient (no flags, for a calm walkthrough)
//  - 1 "flagged" demo patient ALREADY on warfarin, about to be prescribed
//    aspirin — guarantees the safety agent fires a severe flag live
//  - 1 provider (doctor)
//  - 1 appointment scheduled ~35 seconds from script run time, so Hermes
//    fires a token reminder within the first demo-mode cycle
//
// Run this 5-10 minutes before your judging slot, not hours before —
// the appointment timestamp is relative to "now" at seed time.

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const interactions = require("./functions/src/drugInteractions.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function seed() {
  const batch = db.batch();

  // 1. Drug interaction reference data
  interactions.forEach((row) => {
    const ref = db.collection("drugInteractions").doc();
    batch.set(ref, row);
  });

  // 2. Provider
  const providerRef = db.collection("providers").doc("demo-doctor-1");
  batch.set(providerRef, {
    name: "Dr. Anitha Raman",
    role: "doctor",
    orgName: "VORTEXA Demo Clinic",
    createdAt: new Date(),
  });

  // 3. Clean patient — calm walkthrough case
  const cleanPatientRef = db.collection("patients").doc("demo-patient-clean");
  batch.set(cleanPatientRef, {
    name: "Karthik S",
    phone: "9999900001",
    dob: "1990-04-12",
    allergies: [],
    currentMeds: ["metformin"],
    createdAt: new Date(),
  });

  // 4. Flagged patient — guaranteed severe interaction trigger
  //    (warfarin + aspirin is in the seed dataset as "severe")
  const flaggedPatientRef = db.collection("patients").doc("demo-patient-flagged");
  batch.set(flaggedPatientRef, {
    name: "Lakshmi N",
    phone: "9999900002",
    dob: "1965-09-03",
    allergies: ["Penicillin"],
    currentMeds: ["warfarin"],
    createdAt: new Date(),
  });

  // 5. Appointment ~35 seconds out — fires inside the first demo-mode
  //    Hermes cycle (30s lead window, runs every 1 min)
  const apptTime = new Date(Date.now() + 35 * 1000);
  const apptRef = db.collection("appointments").doc();
  batch.set(apptRef, {
    patientId: "demo-patient-clean",
    providerId: "demo-doctor-1",
    scheduledAt: admin.firestore.Timestamp.fromDate(apptTime),
    tokenNumber: 1,
    status: "booked",
    reminderSentAt: null,
    createdAt: new Date(),
  });

  // 6. A followup due "now" so the reminder fires immediately on first run
  const followupRef = db.collection("followups").doc();
  batch.set(followupRef, {
    patientId: "demo-patient-clean",
    prescriptionId: "demo-prescription-seed",
    dueAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000)),
    type: "checkup_reminder",
    status: "pending",
    sentAt: null,
  });

  await batch.commit();
  console.log("Seed complete.");
  console.log("Clean patient: demo-patient-clean");
  console.log("Flagged patient (already on warfarin): demo-patient-flagged");
  console.log("Provider: demo-doctor-1");
  console.log(`Appointment fires reminder around: ${apptTime.toISOString()}`);
  console.log("During the demo: prescribe 'aspirin' to demo-patient-flagged to trigger the safety agent live.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
