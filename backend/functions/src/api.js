// api.js
// HTTPS callable functions the frontend invokes directly (not Firestore
// triggers). Use these from React via httpsCallable(functions, "name").

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { retrieveChunks, buildContextBlock } = require("./rag");
const { reasonAndAnswer } = require("./geminiClient");

const db = getFirestore();

/**
 * bookAppointment — creates an appointment doc with an auto-incrementing
 * token number, scoped per provider per calendar day.
 * Input: { patientId, providerId, scheduledAt: ISO string }
 */
exports.bookAppointment = onCall({ minInstances: 1 }, async (request) => {
  const { patientId, providerId, scheduledAt } = request.data;
  if (!patientId || !providerId || !scheduledAt) {
    throw new HttpsError("invalid-argument", "patientId, providerId, and scheduledAt are required.");
  }

  const apptDate = new Date(scheduledAt);
  const dayStart = new Date(apptDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(apptDate);
  dayEnd.setHours(23, 59, 59, 999);

  // Count existing bookings for this provider on this day to assign the next token.
  const existingSnap = await db
    .collection("appointments")
    .where("providerId", "==", providerId)
    .where("scheduledAt", ">=", Timestamp.fromDate(dayStart))
    .where("scheduledAt", "<=", Timestamp.fromDate(dayEnd))
    .get();

  const tokenNumber = existingSnap.size + 1;

  const apptRef = await db.collection("appointments").add({
    patientId,
    providerId,
    scheduledAt: Timestamp.fromDate(apptDate),
    tokenNumber,
    status: "booked",
    reminderSentAt: null,
    createdAt: new Date(),
  });

  return { appointmentId: apptRef.id, tokenNumber };
});

/**
 * createFollowup — call this right after a prescription is created, to
 * schedule a checkup or refill reminder N days out.
 * Input: { patientId, prescriptionId, daysFromNow, type }
 */
exports.createFollowup = onCall({ minInstances: 1 }, async (request) => {
  const { patientId, prescriptionId, daysFromNow, type } = request.data;
  if (!patientId || !prescriptionId || !daysFromNow) {
    throw new HttpsError("invalid-argument", "patientId, prescriptionId, and daysFromNow are required.");
  }

  const dueAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);

  const ref = await db.collection("followups").add({
    patientId,
    prescriptionId,
    dueAt: Timestamp.fromDate(dueAt),
    type: type || "checkup_reminder",
    status: "pending",
    sentAt: null,
  });

  return { followupId: ref.id, dueAt: dueAt.toISOString() };
});

/**
 * askSafetyAgent — ad-hoc Q&A over a patient's record, e.g. for a doctor
 * asking "is it safe to add ibuprofen here?" outside the auto-trigger flow.
 * Input: { patientId, question, candidateDrug (optional) }
 */
exports.askSafetyAgent = onCall({ minInstances: 1 }, async (request) => {
  const { patientId, question, candidateDrug } = request.data;
  if (!patientId || !question) {
    throw new HttpsError("invalid-argument", "patientId and question are required.");
  }

  const patientSnap = await db.collection("patients").doc(patientId).get();
  if (!patientSnap.exists) {
    throw new HttpsError("not-found", "Patient record not found.");
  }
  const patient = patientSnap.data();
  const allergies = patient.allergies || [];
  const currentMeds = patient.currentMeds || [];
  const newDrug = candidateDrug || "(none specified)";

  // ── RAG retrieval over the clinical knowledge base ──────────────────────
  const chunks = await retrieveChunks({
    newDrug,
    allergies,
    currentMeds,
    question,
  });

  const { contextText, sources } = buildContextBlock(
    { allergies, currentMeds, newDrug },
    chunks
  );

  const { reasoning, result, citations } = await reasonAndAnswer(contextText, question);

  const citedSources = (citations || [])
    .map((n) => sources[n - 1])
    .filter(Boolean);

  return {
    reasoning,
    result,
    sources: citedSources.length ? citedSources : sources.slice(0, 3),
    retrievedCount: sources.length,
  };
});

/**
 * createDoseSchedule — sets up per-dose pill reminders for a patient. Hermes
 * then fires a notification at each `times` entry, daily, for the course.
 * Input: { patientId, drugName, times: ["08:00","20:00"], timezone,
 *          prescriptionId?, dosage?, startDate?, endDate? }
 */
exports.createDoseSchedule = onCall({ minInstances: 1 }, async (request) => {
  const { patientId, prescriptionId, drugName, dosage, times, timezone, startDate, endDate } =
    request.data;

  if (!patientId || !drugName || !Array.isArray(times) || times.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "patientId, drugName, and a non-empty times[] are required."
    );
  }
  if (!times.every((t) => /^\d{1,2}:\d{2}$/.test(String(t)))) {
    throw new HttpsError("invalid-argument", "times must be 'HH:mm' strings, e.g. '08:00'.");
  }

  const ref = await db.collection("doseSchedules").add({
    patientId,
    prescriptionId: prescriptionId || null,
    drugName: String(drugName).toLowerCase(),
    dosage: dosage || null,
    times,
    timezone: timezone || "UTC",
    active: true,
    startDate: startDate ? Timestamp.fromDate(new Date(startDate)) : null,
    endDate: endDate ? Timestamp.fromDate(new Date(endDate)) : null,
    lastFiredAt: null,
    createdAt: new Date(),
  });

  return { doseScheduleId: ref.id };
});

/**
 * logDose — patient marks one dose as taken or snoozed. doseLogId comes from
 * the dose_reminder notification's relatedId (or a doseLogs query in the app).
 * Input: { doseLogId, status: "taken" | "snoozed" }
 */
exports.logDose = onCall({ minInstances: 1 }, async (request) => {
  const patientId = request.auth?.uid;
  if (!patientId) throw new HttpsError("unauthenticated", "Sign in required.");

  const { doseLogId, status } = request.data;
  if (!doseLogId || !["taken", "snoozed"].includes(status)) {
    throw new HttpsError(
      "invalid-argument",
      "doseLogId and status ('taken' | 'snoozed') are required."
    );
  }

  const ref = db.collection("doseLogs").doc(doseLogId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Dose log not found.");
  if (snap.data().patientId !== patientId) {
    throw new HttpsError("permission-denied", "Not your dose log.");
  }

  await ref.update({ status, actedAt: new Date() });
  return { ok: true, status };
});

/**
 * getAdherenceSummary — counts dose outcomes over the last N days (default 7)
 * for the signed-in patient.
 * Input: { days? }
 */
exports.getAdherenceSummary = onCall({ minInstances: 1 }, async (request) => {
  const patientId = request.auth?.uid;
  if (!patientId) throw new HttpsError("unauthenticated", "Sign in required.");

  const days = Math.min(Math.max(parseInt(request.data?.days, 10) || 7, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const snap = await db
    .collection("doseLogs")
    .where("patientId", "==", patientId)
    .where("scheduledFor", ">=", since)
    .get();

  const counts = { taken: 0, missed: 0, snoozed: 0, due: 0 };
  snap.forEach((d) => {
    const st = d.data().status;
    if (counts[st] !== undefined) counts[st] += 1;
  });

  const total = counts.taken + counts.missed + counts.snoozed + counts.due;
  const adherenceRate = total ? Math.round((counts.taken / total) * 100) : null;

  return { days, ...counts, total, adherenceRate };
});
