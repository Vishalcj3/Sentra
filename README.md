# VORTEXA — 24hr build guide

## You (backend/AI) — setup, in order

1. `npm install -g firebase-tools` (if not already installed)
2. `firebase login`
3. `firebase init` in this folder — select Firestore + Functions + Hosting,
   point Functions source at `functions/`, choose JavaScript, don't
   overwrite the files already here.
4. Get a free Gemini API key: https://aistudio.google.com/app/apikey
   (no card required, generous free tier)
5. Set the keys for local emulation — create `functions/.env`:
   ```
   GEMINI_API_KEY=your_key_here
   DEMO_MODE=true

   # Chroma Cloud — RAG knowledge vector store (clinical "details")
   CHROMA_API_KEY=ck-...
   CHROMA_TENANT=...
   CHROMA_DATABASE=Vortexa
   RAG_USE_CHROMA=true   # set "false" to force the offline in-memory KB
   ```
6. `cd functions && npm install`  (installs `chromadb` among others)
7. Run emulators to test before deploying:
   ```
   firebase emulators:start --only functions,firestore
   ```
8. When ready to actually deploy (so the live URL works for judging):
   ```
   firebase functions:config:set gemini.key="your_key_here"
   firebase deploy --only functions,firestore:rules
   ```
   Note: for `onCall`/`onSchedule` v2 functions, prefer setting env vars
   directly in the Firebase Console under Function > Configuration, or use
   `firebase functions:secrets:set GEMINI_API_KEY` — faster than the old
   config API and works the same way in code (`process.env.GEMINI_API_KEY`).

## Seeding the RAG knowledge base (Chroma Cloud)

The clinical knowledge base lives in **Chroma Cloud** (collection `ragKnowledge`),
not Firestore. Seed it once (and whenever `functions/src/knowledgeBase.js` changes):

```
node seed-chroma.js
```

No `serviceAccountKey.json` needed — it uses the `CHROMA_*` creds from
`functions/.env`. Embeddings are the pure-JS 256-dim hash vectors (zero API/cost).
At request time `rag.js` queries Chroma first and falls back to an in-memory copy
of the knowledge base if Chroma is unreachable, so safety checks never block.

> Legacy: `node seed-rag.js` (writes the same data to Firestore) is kept for
> reference but is no longer on the retrieval path.

## Seeding demo data

1. Firebase Console → Project Settings → Service Accounts → Generate new
   private key → save as `serviceAccountKey.json` in this folder (same
   level as `seed.js`). **Do not commit this file or share it.**
2. `npm install firebase-admin` in this folder (top level, not functions/)
3. Run **5–10 minutes before judging**, not earlier:
   ```
   node seed.js
   ```
4. This creates:
   - `demo-patient-clean` — calm walkthrough, no flags
   - `demo-patient-flagged` — already on warfarin; prescribing aspirin to
     this patient WILL trigger a severe interaction flag live
   - `demo-doctor-1` — provider for the dashboard
   - An appointment ~35 seconds out, so a token reminder fires live
   - A followup due immediately, so a checkup reminder fires on first run

## Demo script (aim for under 4 minutes)

1. **Open with the problem** (30s) — fragmented records, no patient
   control, institution-controlled access. (Straight from your problem
   statement — keep this tight, judges have read PS docs before.)

2. **Consent flow** (30s) — show the doctor app requesting access to
   `demo-patient-flagged`, patient app shows the consent toggle, approve
   it. Say plainly: *"real signature verification is architected in our
   design doc; for the 24hr build we're demoing the consent-log layer,
   which is the actual access-control enforcement point."*

3. **The safety agent, live** (60s) — as the doctor, prescribe `aspirin`
   to `demo-patient-flagged` (who's on warfarin). Show the reasoning
   trace appearing first, then the severe flag. This is your best
   differentiator — most teams show a static "AI verified ✓" badge, you
   show the actual reasoning step.

4. **Appointment + token + Hermes, live** (60s) — show the patient app's
   token number and countdown. Within the first minute, the seeded
   appointment's reminder fires — point at the live notification toast
   appearing without a page refresh. Mention the checkup/refill follow-up
   reminder firing the same way.

5. **Fraud/pattern note** (15s) — mention the duplicate-prescription /
   polypharmacy check is part of the same reasoning call, not a separate
   bolt-on.

6. **Close with future scope** (15s) — real crypto signatures, ABDM
   integration, federated learning, multilingual IVR (you've already
   thought hard about this in your rural project — one sentence is
   enough here, don't over-promise).

## Cut list if you're behind schedule

In order of what to cut first if hours run short:
1. Fraud/pattern detection UI (keep it as one line in the safety agent's
   reasoning prompt, skip a dedicated screen)
2. Followup/refill reminders (keep token reminders only — they're more
   visually impressive live)
3. Doctor dashboard polish — a plain table beats a half-built fancy one
4. Multi-provider support — hardcode to one demo doctor

Never cut: the live safety-agent reasoning trace and the live Hermes
notification. Those are your two "wow, it actually ran" moments.
