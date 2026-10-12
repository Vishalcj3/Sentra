// chatAgent.js
// hermesChat — patient-facing conversational assistant over their own record.
// Same callable pattern as askSafetyAgent in api.js, but multi-turn and scoped
// to the signed-in patient. Reuses the Gemini wrapper (geminiClient.chatReply).

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { chatReply } = require("./geminiClient");
const { retrieveChunks, buildContextBlock } = require("./rag");

const db = getFirestore();

exports.hermesChat = onCall({ minInstances: 1 }, async (request) => {
  const patientId = request.auth?.uid; // scope to the signed-in patient
  if (!patientId) throw new HttpsError("unauthenticated", "Sign in required.");

  const { history, message } = request.data;
  if (!message) throw new HttpsError("invalid-argument", "message is required.");

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [patientSnap, rxSnap, apptSnap, followupSnap, doseSnap, logSnap] = await Promise.all([
    db.collection("patients").doc(patientId).get(),
    db.collection("prescriptions").where("patientId", "==", patientId).get(),
    db
      .collection("appointments")
      .where("patientId", "==", patientId)
      .where("scheduledAt", ">=", new Date())
      .orderBy("scheduledAt")
      .limit(1)
      .get(),
    db
      .collection("followups")
      .where("patientId", "==", patientId)
      .where("status", "==", "pending")
      .get(),
    db
      .collection("doseSchedules")
      .where("patientId", "==", patientId)
      .where("active", "==", true)
      .get(),
    db
      .collection("doseLogs")
      .where("patientId", "==", patientId)
      .where("scheduledFor", ">=", sevenDaysAgo)
      .get(),
  ]);

  if (!patientSnap.exists) {
    throw new HttpsError("not-found", "Patient record not found.");
  }

  const patient = patientSnap.data();
  const nextAppt = apptSnap.empty ? null : apptSnap.docs[0].data();

  const adherence = { taken: 0, missed: 0, snoozed: 0, due: 0 };
  logSnap.forEach((d) => {
    const st = d.data().status;
    if (adherence[st] !== undefined) adherence[st] += 1;
  });

  const patientContext = JSON.stringify(
    {
      name: patient.name,
      allergies: patient.allergies || [],
      prescriptions: rxSnap.docs.map((d) => {
        const m = d.data();
        return {
          drug: m.drugName,
          dosage: m.dosage,
          frequency: m.frequency,
          durationDays: m.durationDays,
        };
      }),
      nextAppointment: nextAppt
        ? {
            scheduledAt: nextAppt.scheduledAt.toDate().toISOString(),
            tokenNumber: nextAppt.tokenNumber,
            status: nextAppt.status,
          }
        : null,
      pendingReminders: followupSnap.docs.map((d) => d.data().type),
      pillSchedule: doseSnap.docs.map((d) => {
        const s = d.data();
        return { drug: s.drugName, dosage: s.dosage, times: s.times };
      }),
      adherenceLast7Days: adherence,
    },
    null,
    2
  );

  // ── RAG: pull relevant clinical knowledge for general drug questions ──────
  const allergies = patient.allergies || [];
  const currentMeds = Array.from(
    new Set([...(patient.currentMeds || []), ...rxSnap.docs.map((d) => d.data().drugName)])
  );

  let knowledgeContext = "";
  let sources = [];
  try {
    const chunks = await retrieveChunks({ newDrug: "", allergies, currentMeds, question: message });
    ({ contextText: knowledgeContext, sources } = buildContextBlock(
      { allergies, currentMeds, newDrug: "" },
      chunks
    ));
  } catch (err) {
    console.warn("hermesChat RAG retrieval failed, continuing without it:", err.message);
  }

  const reply = await chatReply({ patientContext, knowledgeContext, history, userMessage: message });
  return { reply, sources };
});
