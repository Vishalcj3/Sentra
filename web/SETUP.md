# VORTEXA Setup Guide

## 1. Firebase Console — Enable Auth providers

Go to Firebase Console → Authentication → Sign-in method:

| Provider | Action |
|---|---|
| **Phone** | Enable |
| **Email/Password** | Enable → also toggle "Email link (passwordless sign-in)" ON |

Then: Authentication → Settings → Authorized domains → Add `localhost`

## 2. Fill in firebase.js

Replace all `"REPLACE_ME"` values in `src/firebase.js` with your project's config from:
Firebase Console → Project Settings → Your apps → Web app → SDK snippet

## 3. Deploy rules

```bash
cd backend
firebase deploy --only firestore:rules,storage:rules
```

## 4. Install & run frontend

```bash
cd web
npm install
npm run dev
```

## 5. Deploy Cloud Functions

```bash
cd backend/functions
npm install
cd ..
firebase deploy --only functions
```

## 6. Seed drug interactions + RAG knowledge base

```bash
cd backend
node seed.js          # demo patients, provider, appointments, drugInteractions
node seed-rag.js      # embeds the clinical knowledge base into ragKnowledge/
firebase deploy --only firestore:indexes   # enables vector findNearest()
```

Until the vector index finishes building, RAG automatically falls back to an
in-memory cosine scan — the app works immediately either way.

---

## RAG System (Retrieval-Augmented Safety Checks)

| Layer | File | What it does |
|---|---|---|
| Embeddings | `functions/src/hashEmbed.js` | Pure-JS hash embedder (MurmurHash3 → feature hashing → random projection → 256-dim). Zero API cost. |
| Vector DB | `functions/src/vectorDb.js` | Firestore `findNearest()` (ANN) with in-memory cosine fallback. |
| Knowledge | `functions/src/knowledgeBase.js` | 51 clinical chunks: interactions, allergy contraindications, guidelines, dosage warnings, lab correlations. |
| Retrieval | `functions/src/rag.js` | Hybrid re-rank: vector similarity + keyword overlap + pairwise drug-pair boost. |
| Reasoning | `functions/src/geminiClient.js` | Gemini grounded ONLY in retrieved chunks, must cite `[n]` sources. |

When a prescription is created, `safetyAgent.js` retrieves the most relevant
knowledge by vector search, feeds it to Gemini, and stores the cited sources on
the prescription. Both the doctor and patient see a collapsible **"🔎 RAG —
N sources cited"** panel under each safety verdict (`src/RagSources.jsx`).

---

## Auth Flow

| Method | UX |
|---|---|
| **Phone** | Enter country code + number → receive SMS OTP → enter 6-digit code |
| **Email** | Enter email → receive magic link → click link to sign in |

## Consent / Document Access Flow

1. **Provider** searches patient by name or phone → "Request access" (selects scope)
2. **Patient** gets a consent card in their Vault tab (real-time)
3. Patient clicks **"Review →"** → ConsentModal opens
4. Patient authenticates via:
   - **Signature** (primary): draws on canvas, photo saved as evidence
   - **PIN** (fallback): 6-digit numeric PIN verified by hash
   - **First time**: prompted to set up signature OR PIN
5. Consent approved → provider can view patient's data

## Role-Based Routing

| Firebase UID doc | Role | App shown |
|---|---|---|
| `patients/{uid}` exists | Patient | PatientApp (Vault, Appointments, Alerts, Security) |
| `providers/{uid}` with `role: "doctor"` | Doctor | DoctorApp (Patients, Prescribe, Queue) |
| `providers/{uid}` with `role: "pharmacist"` | Pharmacist | DoctorApp (Patients, Queue) |
| `providers/{uid}` with `role: "lab"` | Lab Tech | DoctorApp (Patients, Queue) |
| Neither doc exists | — | RegisterScreen (choose role + fill profile) |
