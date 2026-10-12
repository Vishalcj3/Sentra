/**
 * chromaDb.js
 *
 * Chroma Cloud vector store for the VORTEXA RAG "details" — the clinical
 * knowledge base (drug interactions, contraindications, guidelines, …).
 *
 * Per the security split:
 *   • Clinical knowledge DETAILS  → Chroma Cloud   (this module)
 *   • Patient PHI, signature photos, prescriptions, consents, documents
 *                                 → Firestore / Storage  (unchanged)
 *
 * Embeddings stay the same pure-JS 256-dim hash vectors (hashEmbed.js) — we
 * bring our own vectors, so no embedding model or API key is needed on
 * Chroma's side. The collection is created with cosine space so that
 * `score = 1 - distance` is a genuine cosine similarity (matching the
 * semantics the rest of the codebase already assumes).
 *
 * Mirrors the interface of the legacy Firestore vectorDb.js:
 *   upsert(chunk) · upsertMany(chunks) · search(queryVec, k, typeFilter)
 *   deleteAll() · count() · reset()
 *
 * Credentials (process.env, or functions/.env when run as a script):
 *   CHROMA_API_KEY · CHROMA_TENANT · CHROMA_DATABASE
 */

const fs = require("fs");
const path = require("path");

const COLLECTION = "ragKnowledge";
const SPACE = "cosine";
const UPSERT_BATCH = 256;

// ── Env loading ───────────────────────────────────────────────────────────────
// The Firebase Functions runtime auto-loads functions/.env. When this module is
// used from a standalone script (e.g. seed-chroma.js) that hasn't loaded it,
// parse functions/.env ourselves — no dotenv dependency required.
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

// ── Lazy, cached client + collection (reused across warm invocations) ─────────
let _clientPromise = null;
let _collectionPromise = null;

function getClient() {
  if (_clientPromise) return _clientPromise;
  loadEnv();
  const { CloudClient } = require("chromadb");
  const apiKey = process.env.CHROMA_API_KEY;
  const tenant = process.env.CHROMA_TENANT;
  const database = process.env.CHROMA_DATABASE;
  if (!apiKey || !tenant || !database) {
    throw new Error(
      "Missing Chroma credentials (CHROMA_API_KEY / CHROMA_TENANT / CHROMA_DATABASE). " +
      "Set them in functions/.env or the Function's environment config."
    );
  }
  _clientPromise = Promise.resolve(new CloudClient({ apiKey, tenant, database }));
  return _clientPromise;
}

function getCollection() {
  if (_collectionPromise) return _collectionPromise;
  _collectionPromise = getClient().then((client) =>
    client.getOrCreateCollection({
      name: COLLECTION,
      embeddingFunction: null, // bring-your-own hash vectors
      configuration: { hnsw: { space: SPACE } },
      metadata: { source: "knowledgeBase.js", embed: "hash-256", space: SPACE },
    })
  );
  return _collectionPromise;
}

// ── Record (de)serialisation ──────────────────────────────────────────────────
// Chroma metadata values must be scalar (string/number/boolean), so arrays and
// nested objects are JSON-encoded and parsed back out on read.
function toRecord(chunk) {
  return {
    id: chunk.id,
    embedding: chunk.embedding,
    document: chunk.content || "",
    metadata: {
      type: chunk.type || "",
      title: chunk.title || "",
      severity: (chunk.metadata && chunk.metadata.severity) || "",
      keywords: JSON.stringify(chunk.keywords || []),
      metadata: JSON.stringify(chunk.metadata || {}),
    },
  };
}

function fromResult(id, document, meta, distance) {
  let keywords = [];
  let metadata = {};
  try { keywords = JSON.parse(meta.keywords || "[]"); } catch (_) {}
  try { metadata = JSON.parse(meta.metadata || "{}"); } catch (_) {}
  return {
    id,
    type: meta.type || "",
    title: meta.title || "",
    content: document || "",
    keywords,
    metadata,
    score: typeof distance === "number" ? 1 - distance : null, // cosine similarity
  };
}

// ── Writes ────────────────────────────────────────────────────────────────────
/** Upsert a single knowledge chunk ({ id, type, title, content, keywords, embedding, metadata }). */
async function upsert(chunk) {
  return upsertMany([chunk]);
}

/** Upsert many chunks in batches. Returns the number written. */
async function upsertMany(chunks) {
  const collection = await getCollection();
  const records = chunks.map(toRecord);
  for (let i = 0; i < records.length; i += UPSERT_BATCH) {
    const slice = records.slice(i, i + UPSERT_BATCH);
    await collection.upsert({
      ids: slice.map((r) => r.id),
      embeddings: slice.map((r) => r.embedding),
      documents: slice.map((r) => r.document),
      metadatas: slice.map((r) => r.metadata),
    });
  }
  return records.length;
}

// ── Search ────────────────────────────────────────────────────────────────────
/**
 * Find the top-k most similar knowledge chunks to a pre-computed query vector.
 * @param {number[]} queryVec    256-dim hash embedding of the query
 * @param {number}   k           number of results
 * @param {string}   [typeFilter]  optional type, e.g. "drug_interaction"
 * @returns {Promise<Array<{id,type,title,content,keywords,metadata,score}>>}
 */
async function search(queryVec, k = 8, typeFilter = null) {
  const collection = await getCollection();
  const res = await collection.query({
    queryEmbeddings: [queryVec],
    nResults: k,
    where: typeFilter ? { type: { $eq: typeFilter } } : undefined,
  });

  const ids = (res.ids && res.ids[0]) || [];
  const docs = (res.documents && res.documents[0]) || [];
  const metas = (res.metadatas && res.metadatas[0]) || [];
  const dists = (res.distances && res.distances[0]) || [];

  return ids.map((id, i) => fromResult(id, docs[i], metas[i] || {}, dists[i]));
}

// ── Maintenance ───────────────────────────────────────────────────────────────
async function count() {
  const collection = await getCollection();
  return collection.count();
}

/** Delete every document in the collection (keeps the collection itself). */
async function deleteAll() {
  const collection = await getCollection();
  const existing = await collection.get();
  const ids = (existing && existing.ids) || [];
  if (ids.length) await collection.delete({ ids });
  return ids.length;
}

/** Drop the collection entirely and re-create it empty (for clean re-seeds). */
async function reset() {
  const client = await getClient();
  try { await client.deleteCollection({ name: COLLECTION }); } catch (_) {}
  _collectionPromise = null;
  await getCollection();
}

module.exports = {
  upsert,
  upsertMany,
  search,
  count,
  deleteAll,
  reset,
  COLLECTION,
};
