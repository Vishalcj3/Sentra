/**
 * hashEmbed.js
 *
 * Zero-API hash embedding pipeline:
 *   1. Tokenise text → unigrams + bigrams (medical-aware stop-word filter)
 *   2. Feature-hash each token into a 2048-bucket sparse vector (MurmurHash3)
 *   3. Apply a deterministic random-projection matrix (2048 → EMBED_DIM)
 *      to get a dense vector — Johnson-Lindenstrauss guarantee on cosine dist
 *   4. L2-normalise → ready for cosine similarity / Firestore vector search
 *
 * Entire pipeline is pure JS, no external HTTP calls, zero cost per embedding.
 * Similar texts produce similar vectors; the projection preserves dot-product.
 */

const VOCAB_SIZE = 2048;   // hash buckets
const EMBED_DIM  = 256;    // output dimensions stored in Firestore
const PROJ_SEED  = 0xdeadbeef; // fixed seed → reproducible projections

// ── MurmurHash3 (32-bit, pure JS) ────────────────────────────────────────────
function murmur3(str, seed = 0) {
  let h = seed >>> 0;
  const len = str.length;
  for (let i = 0; i < len; i++) {
    let k = str.charCodeAt(i) & 0xff;
    k = Math.imul(k, 0xcc9e2d51) >>> 0;
    k = ((k << 15) | (k >>> 17)) >>> 0;
    k = Math.imul(k, 0x1b873593) >>> 0;
    h ^= k;
    h = ((h << 13) | (h >>> 19)) >>> 0;
    h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
  }
  h ^= len;
  h ^= h >>> 16;
  h  = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h  = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// ── Deterministic random-projection matrix ────────────────────────────────────
// Built once per process, reused. Each entry is ±1 / √EMBED_DIM (sparse
// sign matrix — same quality as Gaussian projection, much cheaper to build).
let _projMatrix = null;

function getProjectionMatrix() {
  if (_projMatrix) return _projMatrix;
  const mat = new Float64Array(VOCAB_SIZE * EMBED_DIM);
  const scale = 1.0 / Math.sqrt(EMBED_DIM);
  for (let i = 0; i < VOCAB_SIZE * EMBED_DIM; i++) {
    const h = murmur3(String(i), PROJ_SEED);
    mat[i] = (h & 1) ? scale : -scale; // ±1/√D
  }
  _projMatrix = mat;
  return mat;
}

// ── Stop words (common English + medical filler words) ────────────────────────
const STOP = new Set([
  "a","an","the","is","in","it","of","to","and","or","for","on","at","by",
  "as","be","was","are","were","with","this","that","from","have","has","had",
  "not","its","can","may","will","due","per","also","such","when","both",
  "into","been","being","than","there","their","they","which","these","those",
  "use","used","using","risk","risks","effect","effects","increased","decreased",
  "may","should","must","patient","patients","drug","drugs","medication",
  "medications","dose","doses","dosage","administration","clinical","level","levels",
]);

// ── Tokeniser ─────────────────────────────────────────────────────────────────
function tokenise(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\-\/]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

  const tokens = [...words]; // unigrams
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(words[i] + "_" + words[i + 1]); // bigrams
  }
  return tokens;
}

// ── TF-weighted sparse vector (feature hashing) ───────────────────────────────
function toSparseVector(tokens) {
  const sparse = new Float64Array(VOCAB_SIZE);
  for (const tok of tokens) {
    const bucket = murmur3(tok) % VOCAB_SIZE;
    // Sign based on a second hash to cancel collisions (Weinberger et al.)
    const sign = (murmur3(tok, 1) & 1) ? 1 : -1;
    sparse[bucket] += sign;
  }
  return sparse;
}

// ── Dense projection via random matrix ───────────────────────────────────────
function project(sparse) {
  const mat   = getProjectionMatrix();
  const dense = new Float64Array(EMBED_DIM);
  for (let bucket = 0; bucket < VOCAB_SIZE; bucket++) {
    if (sparse[bucket] === 0) continue;
    const base = bucket * EMBED_DIM;
    const val  = sparse[bucket];
    for (let d = 0; d < EMBED_DIM; d++) {
      dense[d] += mat[base + d] * val;
    }
  }
  return dense;
}

// ── L2 normalisation ──────────────────────────────────────────────────────────
function l2normalise(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out; // plain Array<number> — safe for Firestore
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Embed a text string → normalised Float64 array of length EMBED_DIM (256).
 * Pure JS, synchronous, zero API calls.
 * @param {string} text
 * @returns {number[]}  length-EMBED_DIM normalised vector
 */
function embed(text) {
  const tokens = tokenise(text);
  if (tokens.length === 0) {
    // Empty / all stop-words → zero vector
    return Array(EMBED_DIM).fill(0);
  }
  const sparse = toSparseVector(tokens);
  const dense  = project(sparse);
  return l2normalise(dense);
}

/**
 * Cosine similarity between two normalised vectors.
 * (Since both are L2-normalised, cosine = dot product.)
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} in [-1, 1]
 */
function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Rank a list of {embedding, ...meta} objects against a query vector.
 * Returns top-k by cosine similarity, score attached.
 * Used as the in-memory fallback when Firestore vector index isn't ready.
 *
 * @param {number[]}  queryVec   embedded query
 * @param {{ id, embedding, content, type, metadata }[]} candidates
 * @param {number}    k
 * @returns {{ id, content, type, metadata, score }[]}
 */
function rankInMemory(queryVec, candidates, k = 8) {
  return candidates
    .map((c) => ({ ...c, score: cosine(queryVec, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

module.exports = { embed, cosine, rankInMemory, EMBED_DIM };
