// Static content for the showcase page. All names and records are fictional
// demo data (they mirror the backend's seed.js), not real patients.

export const REPO_URL = "https://github.com/Vishalcj3/Vortexa";

// ── Hero: one replayed safety check ─────────────────────────────────────────
export const SAFETY_RUN = {
  patient: {
    name: "Lakshmi N",
    id: "PT-7Q2K-91",
    age: 61,
    currentMeds: ["warfarin 5 mg"],
    allergies: ["penicillin"],
  },
  newDrug: { name: "aspirin", dose: "75 mg", frequency: "once daily", days: 30 },
  prescriber: "Dr. Anitha Raman",
  retrieved: { count: 8, total: 51 },
  sources: [
    { n: 1, title: "Warfarin + Aspirin — severe bleeding risk", type: "drug interaction", score: 1.112 },
    { n: 2, title: "INR monitoring for warfarin — target ranges and management", type: "lab correlation", score: 0.684 },
    { n: 3, title: "Warfarin + Ibuprofen — severe bleeding risk", type: "drug interaction", score: 0.571 },
  ],
  reasoning: [
    "Patient is on warfarin, a vitamin K antagonist anticoagulant [1].",
    "Aspirin inhibits platelet aggregation; with warfarin the clotting mechanism is doubly impaired, raising the risk of GI and intracranial bleeding [1].",
    "No penicillin cross-reactivity with aspirin. Not a duplicate therapy; 2 active medicines, so no polypharmacy flag.",
    "Combination should be avoided unless specifically indicated, with close INR monitoring [2].",
  ],
  verdict: { status: "flagged", severity: "severe", interaction: "Warfarin + aspirin: major bleeding risk" },
};

// ── Roles ───────────────────────────────────────────────────────────────────
export const ROLES = [
  {
    id: "patient",
    label: "Patient",
    headline: "Their whole record, in their pocket",
    points: [
      "Medicines, allergies, lab scans and bills from every hospital in one vault",
      "Approves or revokes each provider's access, scope by scope",
      "Gets dose, token and follow-up reminders without opening the app",
    ],
  },
  {
    id: "doctor",
    label: "Doctor",
    headline: "Prescribe with the evidence on screen",
    points: [
      "Requests access to a patient's history and waits for their approval",
      "Sees the safety verdict, the reasoning and the cited sources for every drug",
      "Runs the day's queue with token numbers",
    ],
  },
  {
    id: "pharmacist",
    label: "Pharmacist",
    headline: "Dispense what was checked",
    points: [
      "Looks up a patient and sees each prescription with its safety status",
      "Flagged items show why, before anything leaves the counter",
    ],
  },
  {
    id: "lab",
    label: "Lab tech",
    headline: "Results land in the patient's vault",
    points: [
      "Uploads scans with findings and status",
      "The patient and their approved doctors see them straight away",
    ],
  },
];

// ── Hermes: one patient's day of reminders ──────────────────────────────────
export const DAY = [
  { time: "08:00", kind: "Dose", text: "Time to take your metformin (500 mg) — your 08:00 dose.", action: "Mark as taken" },
  { time: "10:30", kind: "Appointment", text: "Upcoming appointment: token 7 tomorrow with Dr. Anitha Raman.", action: null },
  { time: "13:30", kind: "Token", text: "Your token number 7 is coming up — please head to the clinic now.", action: null },
  { time: "18:00", kind: "Follow-up", text: "Friendly reminder: it's time for your checkup.", action: "Book a slot" },
  { time: "20:00", kind: "Dose", text: "Time to take your metformin (500 mg) — your 20:00 dose.", action: "Mark as taken" },
  { time: "22:00", kind: "Adherence", text: "20:00 dose not marked after 2 hours — logged as missed.", action: null },
];

// ── Safety pipeline (runs in this order on every new prescription) ─────────
export const PIPELINE = [
  { title: "Prescription saved", detail: "A new prescriptions document triggers the safety agent in Cloud Functions." },
  { title: "Retrieve", detail: "The patient's medicines, allergies and the new drug become a query, embedded as a 256-dim hash vector and searched in Chroma Cloud. An in-memory copy answers if Chroma is down." },
  { title: "Re-rank", detail: "Vector score, plus keyword overlap, plus a boost for chunks naming the new drug together with an existing medicine or allergy." },
  { title: "Reason", detail: "Gemini works only from the retrieved chunks, cites them as [n] and returns a JSON verdict." },
  { title: "Verdict", detail: "Status, severity, reasoning and cited sources are written back to the prescription. Flags also notify the patient." },
];

export const KB_BREAKDOWN = [
  { label: "Drug interactions", count: 28 },
  { label: "Allergy contraindications", count: 7 },
  { label: "Clinical guidelines", count: 7 },
  { label: "Lab correlations", count: 5 },
  { label: "Dosage warnings", count: 4 },
];

export const STACK = [
  { area: "Web", items: "React 18 · Vite" },
  { area: "Mobile", items: "Expo · React Native" },
  { area: "Backend", items: "Firebase Functions · Firestore · Storage" },
  { area: "AI", items: "Gemini · Chroma Cloud · hash embeddings" },
];
