// hermesAgent.js
// Hermes = the dispatch/notification agent. Three jobs:
//   1. Token reminders — alert patient ~30 min before their appointment slot.
//   2. Follow-up reminders — alert patient when a post-prescription checkup
//      or refill is due.
//   3. Dose reminders — alert patient at each scheduled pill time (e.g. 08:00,
//      20:00) for the duration of a course.
//
// Runs on a schedule. In DEMO_MODE, "30 minutes" becomes "30 seconds" so
// judges see a reminder fire live instead of waiting half an hour.
// Toggle by setting the DEMO_MODE env var to "true" during judging.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore } = require("firebase-admin/firestore");

const db = getFirestore();

const DEMO_MODE = process.env.DEMO_MODE === "true";
const REMINDER_LEAD_MS = DEMO_MODE ? 30 * 1000 : 30 * 60 * 1000; // 30s demo / 30min real
// How late a missed dose may still fire before we skip it — avoids spamming
// stale doses after downtime or on first deploy mid-day.
const DOSE_GRACE_MS = DEMO_MODE ? 5 * 60 * 1000 : 30 * 60 * 1000;
// How far ahead to send the "you have an upcoming appointment" heads-up. This
// is the day-ahead reminder, distinct from the imminent token reminder above.
const APPT_REMINDER_LEAD_MS = DEMO_MODE ? 60 * 1000 : 24 * 60 * 60 * 1000; // 1min demo / 24h real
// A dose left "due" (unacted-on) longer than this is marked "missed".
const MISSED_AFTER_MS = DEMO_MODE ? 5 * 60 * 1000 : 2 * 60 * 60 * 1000; // 5min demo / 2h real

/**
 * Token reminder pass: finds appointments whose scheduledAt is within the
 * reminder lead window and hasn't been reminded yet, fires a notification.
 */
async function runTokenReminders() {
  const now = Date.now();
  const windowEnd = new Date(now + REMINDER_LEAD_MS);

  const snap = await db
    .collection("appointments")
    .where("status", "==", "booked")
    .where("scheduledAt", "<=", windowEnd)
    .get();

  const batch = db.batch();
  let count = 0;

  for (const doc of snap.docs) {
    const appt = doc.data();
    if (appt.scheduledAt.toMillis() < now) continue; // already passed, skip

    const notifRef = db.collection("notifications").doc();
    batch.set(notifRef, {
      patientId: appt.patientId,
      type: "token_reminder",
      message: `Your token number ${appt.tokenNumber} is coming up — please head to the clinic now.`,
      relatedId: doc.id,
      createdAt: new Date(),
      read: false,
    });
    batch.update(doc.ref, { status: "reminded", reminderSentAt: new Date() });
    count++;
  }

  if (count > 0) await batch.commit();
  return count;
}

/**
 * Follow-up reminder pass: finds followups due now or earlier that haven't
 * been sent yet, fires a notification.
 */
async function runFollowupReminders() {
  const now = new Date();

  const snap = await db
    .collection("followups")
    .where("status", "==", "pending")
    .where("dueAt", "<=", now)
    .get();

  const batch = db.batch();
  let count = 0;

  for (const doc of snap.docs) {
    const followup = doc.data();
    const label = followup.type === "refill_reminder" ? "refill" : "checkup";

    const notifRef = db.collection("notifications").doc();
    batch.set(notifRef, {
      patientId: followup.patientId,
      type: "followup_reminder",
      message: `Friendly reminder: it's time for your ${label}.`,
      relatedId: followup.prescriptionId,
      createdAt: new Date(),
      read: false,
    });
    batch.update(doc.ref, { status: "sent", sentAt: new Date() });
    count++;
  }

  if (count > 0) await batch.commit();
  return count;
}

/**
 * Appointment reminder pass: a day-ahead "you have an upcoming appointment"
 * heads-up. Distinct from the imminent token reminder — deduped via its own
 * apptReminderSentAt field so it never collides with the token-reminder flow,
 * and it leaves status as "booked" so the token reminder still fires later.
 */
async function runAppointmentReminders() {
  const now = Date.now();
  const windowEnd = new Date(now + APPT_REMINDER_LEAD_MS);

  const snap = await db
    .collection("appointments")
    .where("status", "==", "booked")
    .where("scheduledAt", "<=", windowEnd)
    .get();

  const batch = db.batch();
  let count = 0;

  for (const doc of snap.docs) {
    const appt = doc.data();
    if (appt.scheduledAt.toMillis() < now) continue;  // already passed
    if (appt.apptReminderSentAt) continue;            // heads-up already sent

    const when = appt.scheduledAt.toDate();
    const notifRef = db.collection("notifications").doc();
    batch.set(notifRef, {
      patientId: appt.patientId,
      type: "appointment_reminder",
      message: `Upcoming appointment: token number ${appt.tokenNumber} on ${when.toDateString()}. Please plan to attend.`,
      relatedId: doc.id,
      createdAt: new Date(),
      read: false,
    });
    batch.update(doc.ref, { apptReminderSentAt: new Date() });
    count++;
  }

  if (count > 0) await batch.commit();
  return count;
}

// ── Timezone helpers (no external deps) ─────────────────────────────────────
// The Functions runtime is UTC, but dose times are wall-clock in the patient's
// local zone ("take at 20:00"). These resolve a local HH:mm to the correct UTC
// instant, DST included.

/** Offset (ms) of `timeZone` at the given instant: localWallClock - UTC. */
function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = dtf.formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}

/** UTC Date for "today HH:mm" in `timeZone`, or null if HH:mm is malformed. */
function localDoseInstant(hhmm, timeZone, now) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const hh = +m[1], mm = +m[2];
  if (hh > 23 || mm > 59) return null;

  // Today's calendar date in the target zone (en-CA → YYYY-MM-DD).
  const [y, mo, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now).split("-").map(Number);

  const guessUTC = Date.UTC(y, mo - 1, d, hh, mm, 0);
  return new Date(guessUTC - tzOffsetMs(new Date(guessUTC), timeZone));
}

/**
 * Dose reminder pass: for each active dose schedule, fire a notification for
 * any of today's dose times that are now due and haven't been notified yet.
 * Dedupes via lastFiredAt (the latest dose occurrence already notified).
 */
async function runDoseReminders() {
  const now = new Date();
  const nowMs = now.getTime();

  const snap = await db.collection("doseSchedules").where("active", "==", true).get();

  const batch = db.batch();
  let count = 0;

  for (const doc of snap.docs) {
    const s = doc.data();
    const times = Array.isArray(s.times) ? s.times : [];
    if (times.length === 0) continue;

    const tz = s.timezone || "UTC";
    const lastFired = s.lastFiredAt ? s.lastFiredAt.toMillis() : 0;
    const startMs = s.startDate ? s.startDate.toMillis() : -Infinity;
    const endMs = s.endDate ? s.endDate.toMillis() : Infinity;

    let latest = 0;
    const due = [];
    for (const hhmm of times) {
      const instant = localDoseInstant(hhmm, tz, now);
      if (!instant) continue;
      const t = instant.getTime();
      if (t < startMs || t > endMs) continue;     // outside the course
      if (t > nowMs) continue;                      // not yet due today
      if (nowMs - t > DOSE_GRACE_MS) continue;      // too stale — skip
      if (t <= lastFired) continue;                 // already notified
      due.push({ hhmm, t });
      if (t > latest) latest = t;
    }
    if (due.length === 0) continue;

    for (const { hhmm, t } of due) {
      // One adherence log per dose occurrence — deterministic id = idempotent.
      const logRef = db.collection("doseLogs").doc(`${doc.id}__${t}`);
      batch.set(logRef, {
        patientId: s.patientId,
        doseScheduleId: doc.id,
        prescriptionId: s.prescriptionId || null,
        drugName: s.drugName,
        dosage: s.dosage || null,
        scheduledFor: new Date(t),
        status: "due",
        actedAt: null,
        createdAt: new Date(),
      });

      const notifRef = db.collection("notifications").doc();
      batch.set(notifRef, {
        patientId: s.patientId,
        type: "dose_reminder",
        message: `Time to take your ${s.drugName}${s.dosage ? ` (${s.dosage})` : ""} — your ${hhmm} dose.`,
        relatedId: logRef.id, // links the reminder to its dose log for "mark as taken"
        createdAt: new Date(),
        read: false,
      });
      count++;
    }
    batch.update(doc.ref, { lastFiredAt: new Date(latest) });
  }

  if (count > 0) await batch.commit();
  return count;
}

/**
 * Missed-dose sweep: any dose log still "due" past the missed window becomes
 * "missed", so the adherence summary reflects skipped doses.
 */
async function runMissedDoseSweep() {
  const cutoff = new Date(Date.now() - MISSED_AFTER_MS);

  const snap = await db
    .collection("doseLogs")
    .where("status", "==", "due")
    .where("scheduledFor", "<=", cutoff)
    .get();

  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.update(doc.ref, { status: "missed" });
    count++;
  }
  if (count > 0) await batch.commit();
  return count;
}

// Runs every minute. Cheap, fine for a 24hr demo project's read volume.
exports.hermesScheduledRun = onSchedule("every 1 minutes", async () => {
  const [tokenCount, followupCount, doseCount, apptCount, missedCount] = await Promise.all([
    runTokenReminders(),
    runFollowupReminders(),
    runDoseReminders(),
    runAppointmentReminders(),
    runMissedDoseSweep(),
  ]);
  console.log(
    `Hermes run: ${tokenCount} token, ${followupCount} followup, ${doseCount} dose, ` +
      `${apptCount} appointment reminders, ${missedCount} doses marked missed.`
  );
});

module.exports = {
  runTokenReminders,
  runFollowupReminders,
  runDoseReminders,
  runAppointmentReminders,
  runMissedDoseSweep,
};
