# 🩺 Sentra — Patient-Owned Prescription Vault with a Live AI Safety Agent

**Sentra** puts a patient's prescription history in their own hands and gates every provider's
access behind **explicit consent** — then runs a **live AI safety agent** over any new
prescription before it's issued. Instead of a static "AI verified ✓" badge, Sentra streams the
agent's **actual reasoning trace** and raises a flag the moment it finds a dangerous interaction
(e.g. prescribing **aspirin** to a patient already on **warfarin** → severe-interaction flag, live).

> **The edge:** most tools show a verdict. Sentra shows its **reasoning** — the safety agent's
> step-by-step trace appears first, then the flag — so a clinician sees *why*, not just *what*.
> Drug-interaction, duplicate-prescription and polypharmacy checks are all part of the same
> reasoning call, not bolt-ons.

---

## ✨ Features

- **🔐 Consent-gated access** — records are patient-owned; a provider requests access, the patient
  approves via a consent toggle, and the **consent log is the enforcement point** for every read.
- **🧠 Live AI safety agent** — reasons over a new prescription against the patient's active meds
  and a clinical knowledge base, surfacing interaction / duplicate / polypharmacy risks with a
  visible reasoning trace (Gemini-backed).
- **💬 Hermes assistant** — a warm, concise in-app health assistant for patients.
- **🔔 Live reminders** — appointment **token** countdowns and checkup/refill follow-ups fire in
  real time via scheduled Cloud Functions (no page refresh).
- **📚 RAG knowledge base** — clinical "details" live in **Chroma Cloud** (collection
  `ragKnowledge`) with a pure-JS 256-dim hash-embedding path (zero API cost) and an in-memory
  fallback so safety checks never block if Chroma is unreachable.

---

## 🧱 Stack

```
Firebase — Firestore (data) · Cloud Functions (safety agent, reminders) · Hosting
AI       — Google Gemini (reasoning) · Chroma Cloud vector store (RAG)
Auth     — consent-log access control + patient/provider identities
```

Schema is documented in [`SCHEMA.md`](SCHEMA.md); the RAG engine is in `functions/src/rag.js`,
the safety reasoning in `functions/src/` (Gemini client + knowledge base).

---

## 🚀 Setup

1. `npm install -g firebase-tools` → `firebase login`
2. `firebase init` in this folder — Firestore + Functions + Hosting, Functions source `functions/`,
   JavaScript, **don't** overwrite existing files.
3. Get a free Gemini API key: https://aistudio.google.com/app/apikey
4. Create `functions/.env`:
   ```
   GEMINI_API_KEY=your_key_here
   DEMO_MODE=true

   # Chroma Cloud — RAG knowledge vector store (clinical "details")
   CHROMA_API_KEY=ck-...
   CHROMA_TENANT=...
   CHROMA_DATABASE=Vortexa          # the existing Chroma Cloud database name
   RAG_USE_CHROMA=true              # "false" forces the offline in-memory KB
   ```
5. `cd functions && npm install`
6. Local test: `firebase emulators:start --only functions,firestore`
7. Deploy: `firebase deploy --only functions,firestore:rules`
   (set `GEMINI_API_KEY` via `firebase functions:secrets:set` or the Console → Function → Configuration)

> **Note:** the Firebase project id (`vortexa-d430e`) and the auth hash salt in `patientAuth.js`
> are retained as-is — they are the live project's identifiers; renaming them would break deploys
> and existing credential hashes.

### Seed the RAG knowledge base (Chroma Cloud)
```
node seed-chroma.js   # re-run whenever functions/src/knowledgeBase.js changes
```
Uses the `CHROMA_*` creds from `functions/.env`; embeddings are pure-JS hash vectors (no API cost).
`rag.js` queries Chroma first and falls back to an in-memory copy if it's unreachable.

### Seed demo data
1. Firebase Console → Project Settings → Service Accounts → Generate new private key → save as
   `serviceAccountKey.json` here (**never commit or share it**).
2. `npm install firebase-admin` (top level), then `node seed.js`. This creates:
   - `demo-patient-clean` — calm walkthrough, no flags
   - `demo-patient-flagged` — on warfarin; prescribing aspirin triggers a **severe interaction flag** live
   - `demo-doctor-1` — provider for the dashboard
   - an appointment ~35s out (token reminder fires live) and a follow-up due immediately

---

## 🗺️ Future scope

Real cryptographic consent signatures · **ABDM** integration · federated learning across
institutions · multilingual IVR for low-literacy / rural access.

---

_Patient-owned prescription vault with consent-gated access and a live, explainable AI safety agent._
