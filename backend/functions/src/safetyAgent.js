// safetyAgent.js
// Firestore-triggered function: fires whenever a new prescription doc is
// created. Pulls patient context, runs RAG retrieval over the clinical
// knowledge base (hash embeddings + Firestore vector search), asks Gemini
// to reason step-by-step grounded in the retrieved evidence, and writes the
// verdict + reasoning trace + cited sources back onto the prescription doc.

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getFirestore } = require("firebase-admin/firestore");
const { retrieveChunks, buildContextBlock } = require("./rag");
const { reasonAndAnswer } = require("./geminiClient");

const db = getFirestore();

exports.runSafetyCheck = onDocumentCreated(
  { document: "prescriptions/{prescriptionId}", minInstances: 1 },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const prescription = snap.data();
    const { patientId, drugName } = prescription;
    const prescriptionRef = snap.ref;

    try {
      const patientSnap = await db.collection("patients").doc(patientId).get();
      if (!patientSnap.exists) {
        await prescriptionRef.update({
          "safetyCheck.status": "flagged",
          "safetyCheck.reasoning": "Patient record not found — cannot verify safety automatically.",
          "safetyCheck.interactions": ["Missing patient record"],
          "safetyCheck.checkedAt": new Date(),
        });
        return;
      }

      const patient = patientSnap.data();
      const allergies = patient.allergies || [];
      const currentMeds = patient.currentMeds || [];

      // ── RAG retrieval ────────────────────────────────────────────────────
      const chunks = await retrieveChunks({
        newDrug: drugName,
        allergies,
        currentMeds,
      });

      const { contextText, sources } = buildContextBlock(
        { allergies, currentMeds, newDrug: drugName },
        chunks
      );

      const task = `Check whether adding "${drugName}" to this patient's regimen poses a drug interaction, allergy conflict, or duplicate medication risk. Also flag polypharmacy if the patient already has 4 or more active medications. Ground every conclusion in the retrieved knowledge and cite the [n] items you used.`;

      const { reasoning, result, citations } = await reasonAndAnswer(contextText, task);

      // Map cited bracket numbers back to source objects for the UI.
      const citedSources = (citations || [])
        .map((n) => sources[n - 1])
        .filter(Boolean);

      await prescriptionRef.update({
        "safetyCheck.status": result.status,
        "safetyCheck.reasoning": reasoning,
        "safetyCheck.interactions": result.interactions || [],
        "safetyCheck.severity": result.severity || "none",
        "safetyCheck.sources": citedSources.length ? citedSources : sources.slice(0, 3),
        "safetyCheck.retrievedCount": sources.length,
        "safetyCheck.checkedAt": new Date(),
      });

      // If flagged, push a notification so it surfaces in the alert feed immediately.
      if (result.status === "flagged") {
        await db.collection("notifications").add({
          patientId,
          type: "safety_alert",
          message: `Safety check flagged a concern for ${drugName}: ${(result.interactions || []).join("; ")}`,
          relatedId: prescriptionRef.id,
          createdAt: new Date(),
          read: false,
        });
      }
    } catch (err) {
      console.error("Safety check failed:", err);
      await prescriptionRef.update({
        "safetyCheck.status": "flagged",
        "safetyCheck.reasoning": "Automated check failed due to a system error. Manual review required.",
        "safetyCheck.checkedAt": new Date(),
      });
    }
  }
);
