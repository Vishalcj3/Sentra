# VORTEXA Firestore Schema v2

Field names are canonical — don't improvise new ones mid-build.

## Auth & Roles

Firebase Auth handles identity (phone OTP / email magic link).
After sign-in, check `patients/{uid}` then `providers/{uid}` to resolve role.

- **patient** → doc exists in `patients/{uid}`
- **doctor | pharmacist | lab** → doc exists in `providers/{uid}`, field `role` discriminates

## Collections

### `patients/{uid}`
```json
{
  "name": "string",
  "email": "string | null",
  "phone": "string | null",               // e.g. "+919876543210"
  "dob": "string (YYYY-MM-DD) | null",
  "allergies": ["string"],
  "currentMeds": ["string"],

  // Identity verification (for consent approval)
  "pinHash": "string | null",             // SHA-256(pin + 'vortexa-v1'), set by patient
  "signatureUrl": "string | null",        // Firebase Storage URL to signature PNG

  "createdAt": "timestamp"
}
```

### `providers/{uid}`
```json
{
  "name": "string",
  "role": "doctor | pharmacist | lab",
  "orgName": "string",
  "email": "string | null",
  "phone": "string | null",
  "createdAt": "timestamp"
}
```

### `consents/{consentId}`
Patient approves via **signature photo** (primary) or **PIN** (fallback).
```json
{
  "patientId": "string",
  "providerId": "string",
  "providerName": "string",               // for display in the consent modal
  "orgName": "string",                    // provider's org, displayed to patient
  "scope": "view_history | add_prescription | view_labs",
  "approved": "boolean",
  "approvedAt": "timestamp | null",
  "consentSignatureUrl": "string | null", // Storage URL of signature captured at approval time
  "expiresAt": "timestamp",
  "requestedAt": "timestamp"
}
```

### `prescriptions/{prescriptionId}`
```json
{
  "patientId": "string",
  "providerId": "string",
  "drugName": "string (lowercase)",
  "dosage": "string",
  "frequency": "string",
  "durationDays": "number",
  "createdAt": "timestamp",
  "safetyCheck": {
    "status": "pending | clear | flagged",
    "reasoning": "string",          // Gemini chain-of-thought, cites [n] sources
    "interactions": ["string"],
    "severity": "none | minor | moderate | severe",
    "sources": [                    // RAG: knowledge chunks the agent cited
      { "id": "string", "title": "string", "type": "string",
        "severity": "string | null", "score": "number" }
    ],
    "retrievedCount": "number",     // total chunks retrieved by vector search
    "checkedAt": "timestamp"
  }
}
```

### `ragKnowledge` — RAG vector store → **Chroma Cloud** (not Firestore)

> **Moved out of Firestore.** The clinical knowledge "details" now live in the
> Chroma Cloud collection `ragKnowledge` (database `Vortexa`). Only the photos
> and documents (signatures, prescriptions, patient PHI, consents) stay in
> Firestore/Storage for security. Seeded by `node seed-chroma.js`.
> The legacy `node seed-rag.js` (Firestore) and its vector index are kept for
> reference but are no longer on the retrieval path.

Each Chroma record (clinical knowledge chunk):
```jsonc
// id        : chunk id (e.g. "dd-warfarin-aspirin")
// embedding : 256-dim hash embedding (pure JS, no API), cosine space
// document  : the prose content chunk (embedded + quoted in reasoning)
// metadata  : {
//   "type":     "drug_interaction | allergy_contraindication | clinical_guideline | dosage_warning | lab_correlation",
//   "title":    "string",
//   "severity": "string",          // hoisted for filtering
//   "keywords": "[...]",            // JSON-encoded array (Chroma needs scalars)
//   "metadata": "{...}"            // JSON-encoded original metadata object
// }
```
Retrieval (`functions/src/rag.js`) queries Chroma Cloud first and falls back to
an in-memory copy of `knowledgeBase.js` if Chroma is unreachable, so a safety
check is never blocked by the network.

### `appointments/{appointmentId}`
```json
{
  "patientId": "string",
  "providerId": "string",
  "scheduledAt": "timestamp",
  "tokenNumber": "number",
  "status": "booked | reminded | checked_in | completed | cancelled",
  "reminderSentAt": "timestamp | null",       // imminent token reminder (~30 min before)
  "apptReminderSentAt": "timestamp | null",   // day-ahead appointment heads-up
  "createdAt": "timestamp"
}
```

### `followups/{followupId}`
```json
{
  "patientId": "string",
  "prescriptionId": "string",
  "dueAt": "timestamp",
  "type": "checkup_reminder | refill_reminder",
  "status": "pending | sent | done",
  "sentAt": "timestamp | null"
}
```

### `doseSchedules/{scheduleId}`
Per-dose pill reminders. Hermes fires one notification per scheduled time, per
day, for the life of the course. Created via the `createDoseSchedule` callable.
```json
{
  "patientId": "string",
  "prescriptionId": "string | null",            // links back to the prescription
  "drugName": "string (lowercase)",
  "dosage": "string | null",
  "times": ["08:00", "20:00"],                   // 24h HH:mm, patient's local clock
  "timezone": "string (IANA, e.g. Asia/Kolkata)",// defaults to "UTC"
  "active": "boolean",
  "startDate": "timestamp | null",               // course start; null = active now
  "endDate": "timestamp | null",                 // course end; null = open-ended
  "lastFiredAt": "timestamp | null",             // dedupe: latest dose occurrence notified
  "createdAt": "timestamp"
}
```

### `doseLogs/{logId}`
One row per dose occurrence — adherence trail. Doc id is
`<doseScheduleId>__<epochMs>`, so re-runs are idempotent. Hermes creates it
`"due"` when the reminder fires; the patient marks it `"taken"`/`"snoozed"` via
the `logDose` callable; the missed-dose sweep flips stale `"due"` rows to
`"missed"`. Read by `getAdherenceSummary` and the chatbot.
```json
{
  "patientId": "string",
  "doseScheduleId": "string",
  "prescriptionId": "string | null",
  "drugName": "string",
  "dosage": "string | null",
  "scheduledFor": "timestamp",                  // the dose instant
  "status": "due | taken | snoozed | missed",
  "actedAt": "timestamp | null",                // when the patient marked it
  "createdAt": "timestamp"
}
```

### `notifications/{notificationId}`
```json
{
  "patientId": "string",
  "type": "token_reminder | appointment_reminder | followup_reminder | dose_reminder | safety_alert",
  "message": "string",
  "relatedId": "string",
  "createdAt": "timestamp",
  "read": "boolean"
}
```

### `drugInteractions` (static, seed once)
```json
{
  "drugA": "string (lowercase)",
  "drugB": "string (lowercase)",
  "severity": "minor | moderate | severe",
  "description": "string"
}
```

## Firebase Storage paths

```
signatures/{patientId}.png              — patient's registered signature
consent-signatures/{patientId}/{consentId}.png — signature captured at consent approval
```

## Demo-mode flag
Set `DEMO_MODE=true` in Cloud Functions env config.
When true, Hermes treats "30 minutes before" as "30 seconds before".

## Auth enablement checklist (Firebase Console)
1. Authentication → Sign-in method → Phone: **Enable**
2. Authentication → Sign-in method → Email/Password → **Email link (passwordless): Enable**
3. Authentication → Settings → Authorized domains: add `localhost`
4. Storage → Rules: allow authenticated reads/writes to `signatures/` and `consent-signatures/`
