/**
 * vectorDb.js
 *
 * Thin wrapper over Firestore vector search (Admin SDK v12+).
 * Collection: `ragKnowledge`
 *
 * Primary path  → Firestore `findNearest()` (ANN, needs a vector index)
 * Fallback path → in-memory cosine scan (always works, used when index
 *                 isn't provisioned yet or during local emulation)
 *
 * Vector index is declared in firestore.indexes.json and deployed with:
 *   firebase deploy --only firestore:indexes
 *
 * Schema per document:
 * {
 *   id:        string,
 *   type:      string,
 *   title:     string,
 *   content:   string,
 *   keywords:  string[],
 *   embedding: VectorValue (256-dim),
 *   metadata:  object
 * }
 */

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { rankInMemory } = require("./hashEmbed");

const COLLECTION = "ragKnowledge";
const EMBED_FIELD = "embedding";
const EMBED_DIM   = 256;

// ── In-memory cache (warm-start optimisation) ─────────────────────────────────
// Cloud Function invocations share the same process on warm starts.
// Caching the full knowledge set avoids a Firestore read on every invocation.
let _cache = null;       // { docs: [...], loadedAt: Date }
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function loadAllDocs() {
  const now = Date.now();
  if (_cache && now - _cache.loadedAt < CACHE_TTL_MS) return _cache.docs;

  const db = getFirestore();
  const snap = await db.collection(COLLECTION).get();
  const docs = snap.docs.map((d) => {
    const data = d.data();
    // Firestore VectorValue → plain number array for cosine math
    const embRaw = data[EMBED_FIELD];
    const embedding = embRaw?.toArray ? embRaw.toArray() : (Array.isArray(embRaw) ? embRaw : []);
    return { id: d.id, ...data, embedding };
  });

  _cache = { docs, loadedAt: now };
  return docs;
}

// ── Upsert a knowledge chunk ──────────────────────────────────────────────────
/**
 * Write or overwrite a knowledge chunk in Firestore.
 * @param {{ id, type, title, content, keywords, embedding, metadata }} chunk
 */
async function upsert(chunk) {
  const db = getFirestore();
  const { id, embedding, ...rest } = chunk;
  await db.collection(COLLECTION).doc(id).set({
    ...rest,
    [EMBED_FIELD]: FieldValue.vector(embedding),
  });
  _cache = null; // invalidate cache after write
}

// ── Search: Firestore ANN → in-memory fallback ───────────────────────────────
/**
 * Find the top-k most similar knowledge chunks to `queryVec`.
 *
 * @param {number[]} queryVec   normalised 256-dim hash embedding
 * @param {number}   k          number of results to return
 * @param {string}   [typeFilter]  optional, e.g. "drug_interaction"
 * @returns {Promise<{ id, type, title, content, keywords, metadata, score }[]>}
 */
async function search(queryVec, k = 8, typeFilter = null) {
  const db = getFirestore();

  // ── Primary: Firestore vector search ──────────────────────────────────────
  try {
    let coll = db.collection(COLLECTION);
    if (typeFilter) coll = coll.where("type", "==", typeFilter);

    const vectorQuery = coll.findNearest({
      vectorField: EMBED_FIELD,
      queryVector: FieldValue.vector(queryVec),
      limit: k,
      distanceMeasure: "COSINE",
      distanceResultField: "_distance",
    });

    const snap = await vectorQuery.get();
    if (!snap.empty) {
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type,
          title: data.title,
          content: data.content,
          keywords: data.keywords || [],
          metadata: data.metadata || {},
          score: 1 - (data._distance || 0), // COSINE distance → similarity
        };
      });
    }
  } catch (_err) {
    // Vector index not yet provisioned → fall through to in-memory scan
    console.warn("Firestore vector search unavailable, using in-memory fallback:", _err.message);
  }

  // ── Fallback: in-memory cosine scan ───────────────────────────────────────
  const allDocs = await loadAllDocs();
  const filtered = typeFilter ? allDocs.filter((d) => d.type === typeFilter) : allDocs;
  return rankInMemory(queryVec, filtered, k).map((d) => ({
    id: d.id,
    type: d.type,
    title: d.title,
    content: d.content,
    keywords: d.keywords || [],
    metadata: d.metadata || {},
    score: d.score,
  }));
}

// ── Bulk delete (for re-seeding) ──────────────────────────────────────────────
async function deleteAll() {
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).get();
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let count = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    if (++count % BATCH_SIZE === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % BATCH_SIZE !== 0) await batch.commit();
  _cache = null;
  return count;
}

// ── Count ─────────────────────────────────────────────────────────────────────
async function count() {
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).count().get();
  return snap.data().count;
}

module.exports = { upsert, search, deleteAll, count, loadAllDocs };
