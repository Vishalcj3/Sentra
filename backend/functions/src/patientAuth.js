/**
 * patientAuth.js
 *
 * Patient access verification. Same hashing logic over a pluggable store.
 *
 * Two credentials per patient, BOTH stored hashed (never in clear):
 *   • Primary  → digital signature   — SHA-256 (peppered), constant-time compare
 *   • Fallback → PIN  ("forgot sign")— scrypt KDF, per-user salt + server pepper
 * The patient id is stored hashed too (SHA-256 + pepper) and is the lookup key.
 *
 * Authentication is EXACT-MATCH, never similarity — a near-miss must never
 * authenticate. Lookup is by exact id-hash key in BOTH backends:
 *
 *   • firestoreStore — exact doc() lookup. The FAST hot path (~ms, co-located,
 *                      no vector round-trip). Default. Auto-inits inside Cloud
 *                      Functions; needs a service account to run standalone.
 *   • chromaStore    — record kept in the Chroma `patientAuth` collection with a
 *                      deterministic id-hash vector. Lookup is still exact (by
 *                      id), not similarity. No service account needed — handy for
 *                      standalone scripts. Reserve Chroma's similarity for RAG /
 *                      biometrics, not for credential checks.
 *
 * Default store = firestoreStore. Override per call:  verify(attempt, { store: chromaStore })
 *
 * Set AUTH_PEPPER in functions/.env before using in production.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { embed } = require("./hashEmbed");

const COLLECTION = "patientAuth";
const SPACE = "cosine";

// scrypt params — CPU/memory-hard, slows brute force of low-entropy PINs.
// N=16384,r=8 → ~16 MiB per hash (under Node's 32 MiB scrypt default).
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

// ── Env loading (mirror chromaDb.js: auto-load functions/.env when run as a script) ──
function loadEnv() {
  if (process.env.CHROMA_API_KEY) return;
  const envPath = path.join(__dirname, "..", ".env"); // functions/.env
  try {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch (_) {
    /* file absent — env vars expected to be set another way */
  }
}

function pepper() {
  const p = process.env.AUTH_PEPPER;
  if (!p) {
    console.warn(
      "AUTH_PEPPER not set — using a weak dev default. Set AUTH_PEPPER in functions/.env for production."
    );
    return "vortexa-dev-pepper";
  }
  return p;
}

// ── Hash helpers ────────────────────────────────────────────────────────────────
/** Deterministic, peppered SHA-256 (hex). Used for id + signature so they can be looked up / compared exactly. */
function sha256(value) {
  return crypto.createHash("sha256").update(`${value}:${pepper()}`).digest("hex");
}

/** Slow, salted KDF for the PIN. Returns "salt:derived" (both hex). */
function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto
    .scryptSync(`${pin}:${pepper()}`, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
    .toString("hex");
  return `${salt}:${derived}`;
}

/** Re-derive and constant-time compare a PIN against a stored "salt:derived". */
function verifyPin(pin, stored) {
  if (!pin || !stored) return false;
  const [salt, derived] = String(stored).split(":");
  if (!salt || !derived) return false;
  const candidate = crypto
    .scryptSync(`${pin}:${pepper()}`, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
    .toString("hex");
  return safeEqualHex(candidate, derived);
}

/** Constant-time compare of two equal-length hex strings. */
function safeEqualHex(a, b) {
  const ba = Buffer.from(a || "", "hex");
  const bb = Buffer.from(b || "", "hex");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ── Storage backends ─────────────────────────────────────────────────────────────
// Each store implements: get(idHash) → metadata|null · put(idHash, metadata) · update(idHash, metadata)

/** Firestore exact-doc store — the fast hot path. Lookup is a single key fetch, no vector. */
const firestoreStore = {
  async get(idHash) {
    const { getFirestore } = require("firebase-admin/firestore");
    const snap = await getFirestore().collection(COLLECTION).doc(idHash).get();
    return snap.exists ? snap.data() : null;
  },
  async put(idHash, metadata) {
    const { getFirestore } = require("firebase-admin/firestore");
    await getFirestore().collection(COLLECTION).doc(idHash).set(metadata);
  },
  async update(idHash, metadata) {
    const { getFirestore } = require("firebase-admin/firestore");
    await getFirestore().collection(COLLECTION).doc(idHash).set(metadata, { merge: true });
  },
};

// Lazy, cached Chroma client + collection (reused across warm invocations).
let _clientPromise = null;
let _collectionPromise = null;

function getChromaCollection() {
  if (_collectionPromise) return _collectionPromise;
  if (!_clientPromise) {
    loadEnv();
    const { CloudClient } = require("chromadb");
    const { CHROMA_API_KEY, CHROMA_TENANT, CHROMA_DATABASE } = process.env;
    if (!CHROMA_API_KEY || !CHROMA_TENANT || !CHROMA_DATABASE) {
      throw new Error("Missing Chroma credentials (CHROMA_API_KEY / CHROMA_TENANT / CHROMA_DATABASE).");
    }
    _clientPromise = Promise.resolve(
      new CloudClient({ apiKey: CHROMA_API_KEY, tenant: CHROMA_TENANT, database: CHROMA_DATABASE })
    );
  }
  _collectionPromise = _clientPromise.then((client) =>
    client.getOrCreateCollection({
      name: COLLECTION,
      embeddingFunction: null, // bring-your-own hash vectors
      configuration: { hnsw: { space: SPACE } },
      metadata: { purpose: "patient-access-auth", embed: "hash-256", space: SPACE },
    })
  );
  return _collectionPromise;
}

/** Chroma store — exact lookup by id (not similarity); vector is a deterministic id-hash embedding. */
const chromaStore = {
  async get(idHash) {
    const collection = await getChromaCollection();
    const res = await collection.get({ ids: [idHash] });
    return (res && res.metadatas && res.metadatas[0]) || null;
  },
  async put(idHash, metadata) {
    const collection = await getChromaCollection();
    await collection.upsert({
      ids: [idHash],
      embeddings: [embed(idHash)], // deterministic vector from the id-hash
      documents: [""],             // no plaintext ever stored
      metadatas: [metadata],
    });
  },
  async update(idHash, metadata) {
    const collection = await getChromaCollection();
    await collection.update({ ids: [idHash], metadatas: [metadata] });
  },
};

// ── Enrollment ──────────────────────────────────────────────────────────────────
/**
 * Register a patient's credentials (all hashed).
 * @param {{ patientId: string, signature: string, pin: string }} cred
 * @param {{ store?: object }} [opts]
 * @returns {Promise<{ idHash: string }>}
 */
async function enroll({ patientId, signature, pin }, { store = firestoreStore } = {}) {
  if (!patientId || !signature || !pin) {
    throw new Error("enroll requires patientId, signature and pin");
  }
  const idHash = sha256(patientId);
  const metadata = {
    idHash,
    signatureHash: sha256(signature),
    pinHash: hashPin(pin),
    revoked: false,
    enrolledAt: new Date().toISOString(),
  };
  await store.put(idHash, metadata);
  return { idHash };
}

// ── Verification → access decision ───────────────────────────────────────────────
/**
 * Verify a patient and decide access. Primary factor is the digital signature;
 * if it's absent or wrong ("forgot sign"), fall back to the PIN.
 *
 * @param {{ patientId: string, signature?: string, pin?: string }} attempt
 * @param {{ store?: object }} [opts]
 * @returns {Promise<{ access: boolean, method: "signature"|"pin"|null, reason: string }>}
 */
async function verify({ patientId, signature, pin }, { store = firestoreStore } = {}) {
  if (!patientId) return deny("missing patientId");

  const idHash = sha256(patientId);
  const rec = await store.get(idHash); // exact key lookup, NOT similarity

  if (!rec) return deny("unknown patient");
  if (rec.revoked) return deny("credentials revoked");

  // Primary: digital signature (exact hash match, constant-time).
  if (signature && safeEqualHex(sha256(signature), rec.signatureHash)) {
    return grant("signature");
  }

  // Fallback: PIN ("forgot sign").
  if (pin && verifyPin(pin, rec.pinHash)) {
    return grant("pin");
  }

  return deny(signature || pin ? "credentials do not match" : "no credential supplied");
}

function grant(method) { return { access: true, method, reason: "verified" }; }
function deny(reason)   { return { access: false, method: null, reason }; }

// ── Maintenance ──────────────────────────────────────────────────────────────────
/** Mark a patient's credentials revoked (kills both factors). */
async function revoke(patientId, { store = firestoreStore } = {}) {
  const idHash = sha256(patientId);
  const rec = await store.get(idHash);
  if (!rec) return false;
  await store.update(idHash, { ...rec, revoked: true });
  return true;
}

module.exports = {
  enroll, verify, revoke,
  firestoreStore, chromaStore,
  sha256, hashPin, verifyPin, COLLECTION,
};
