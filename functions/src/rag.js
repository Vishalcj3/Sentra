/**
 * rag.js  —  VORTEXA Retrieval-Augmented Generation engine
 *
 * Pipeline:
 *   1. Build a multi-angle query from patient context + new drug
 *   2. Hash-embed the query  (hashEmbed.js — pure JS, zero API)
 *   3. Vector search in Chroma Cloud (chromaDb.js)
 *        primary  → Chroma Cloud query()    (the clinical "details" store)
 *        fallback → in-memory cosine scan   (always works, zero network)
 *   4. Keyword-boost: re-rank results using BM25-inspired term overlap
 *      to catch cases where the hash projection missed a key term
 *   5. Return top-k chunks + the formatted context block for Gemini
 *
 * The clinical knowledge base lives in Chroma Cloud (collection
 * `ragKnowledge`) — seeded by running:  node seed-chroma.js
 * Patient PHI, signature photos and documents stay in Firestore/Storage.
 */

const { embed, cosine } = require("./hashEmbed");
const chromaDb                 = require("./chromaDb");
const KNOWLEDGE_BASE           = require("./knowledgeBase");

const TOP_K         = 8;
const KEYWORD_BOOST = 0.15;
const PAIR_BOOST    = 0.40;

// Pull a generous candidate pool from Chroma, then re-rank locally so the
// keyword/pair boosts can still promote a chunk the pure vector score ranked
// low. Sized to comfortably cover the current knowledge base.
const CANDIDATE_POOL = 50;

// Flip RAG_USE_CHROMA="false" to force the offline in-memory KB path.
const USE_CHROMA = process.env.RAG_USE_CHROMA !== "false";

// ── In-memory KB cache ────────────────────────────────────────────────────────
// Pre-embed the 51 static chunks once per warm Function instance.
// Warm invocations skip Firestore entirely — cosine scan of 51 vecs is <1ms.
let _embeddedKB = null;

function getEmbeddedKB() {
  if (_embeddedKB) return _embeddedKB;
  _embeddedKB = KNOWLEDGE_BASE.map(chunk => ({
    ...chunk,
    _vec: embed(chunk.title + ". " + chunk.content + " " + chunk.keywords.join(" ")),
  }));
  return _embeddedKB;
}

// ── Query builder ─────────────────────────────────────────────────────────────
/**
 * Compose a rich query string that captures the full context Gemini will reason
 * about — not just the new drug, but also the patient's background.
 */
function buildQuery({ newDrug, allergies = [], currentMeds = [], question = "" }) {
  const parts = [];
  parts.push(`drug interaction safety check for ${newDrug}`);
  if (currentMeds.length) parts.push(`concurrent medications ${currentMeds.join(" ")}`);
  if (allergies.length)   parts.push(`patient allergies ${allergies.join(" ")}`);
  if (question)           parts.push(question);
  return parts.join(". ");
}

// ── Keyword overlap score (BM25-inspired, fast) ───────────────────────────────
function keywordScore(chunk, queryTerms) {
  const chunkWords = new Set([
    ...chunk.keywords.map(k => k.toLowerCase()),
    ...(chunk.content.toLowerCase().split(/\W+/)),
  ]);
  let hits = 0;
  for (const t of queryTerms) if (chunkWords.has(t)) hits++;
  return hits / Math.max(queryTerms.length, 1);
}

// ── Pairwise relevance: does this chunk concern the NEW drug + an existing risk? ─
// A chunk whose keywords/content reference the new drug AND a current med (or an
// allergy) is almost certainly the specific interaction/contraindication we care
// about — far more relevant than a chunk that merely mentions one of the drugs.
function chunkMentions(chunk, term) {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  if (chunk.keywords.some(k => k.toLowerCase().includes(t) || t.includes(k.toLowerCase()))) return true;
  return chunk.content.toLowerCase().includes(t);
}

function pairBoost(chunk, newDrug, currentMeds, allergies) {
  if (!chunkMentions(chunk, newDrug)) return 0;
  const others = [...currentMeds, ...allergies];
  return others.some(o => chunkMentions(chunk, o)) ? PAIR_BOOST : 0;
}

// ── Extract meaningful terms from query for keyword scoring ───────────────────
function extractTerms(query) {
  const STOP = new Set(["for","the","a","an","and","or","of","to","in","is","with","on","at","by"]);
  return query.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !STOP.has(w));
}

// ── Re-rank: vector score + keyword overlap + new-drug/risk pair boost ────────
function rerank(candidates, { newDrug, currentMeds, allergies, queryTerms }, k) {
  return candidates
    .map(chunk => ({
      ...chunk,
      finalScore:
        chunk.score +
        KEYWORD_BOOST * keywordScore(chunk, queryTerms) +
        pairBoost(chunk, newDrug, currentMeds, allergies),
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, k);
}

// ── Main retrieval function ───────────────────────────────────────────────────
/**
 * Retrieve the most relevant knowledge chunks for a prescribing context.
 *
 * Primary path queries Chroma Cloud (the clinical "details" store). If Chroma
 * is unavailable or returns nothing, we fall back to the in-memory embedded KB
 * so a safety check is never blocked by a network/store issue.
 *
 * @param {{ newDrug, allergies, currentMeds, question? }} context
 * @param {number} k  number of chunks to return
 * @returns {Promise<Array<{id, type, title, content, keywords, metadata, score, finalScore}>>}
 */
async function retrieveChunks(context, k = TOP_K) {
  const { newDrug = "", allergies = [], currentMeds = [] } = context;
  const queryText  = buildQuery(context);
  const queryVec   = embed(queryText);
  const queryTerms = extractTerms(queryText);
  const rerankCtx  = { newDrug, currentMeds, allergies, queryTerms };

  // ── Primary: Chroma Cloud vector search ───────────────────────────────────
  if (USE_CHROMA) {
    try {
      const candidates = await chromaDb.search(queryVec, CANDIDATE_POOL);
      if (candidates.length) return rerank(candidates, rerankCtx, k);
      console.warn("Chroma returned no candidates — using in-memory KB fallback.");
    } catch (err) {
      console.warn("Chroma retrieval failed, using in-memory KB fallback:", err.message);
    }
  }

  // ── Fallback: in-memory embedded KB (zero network, always available) ──────
  const kb = getEmbeddedKB();
  const candidates = kb.map(chunk => ({ ...chunk, score: cosine(queryVec, chunk._vec) }));
  return rerank(candidates, rerankCtx, k);
}

// ── Context block for Gemini ──────────────────────────────────────────────────
/**
 * Build the plain-text context block that goes into the Gemini prompt.
 * Returns both the text block and the source list (for storing in Firestore).
 *
 * @param {{ allergies, currentMeds, newDrug }} patient
 * @param {Array} chunks  retrieved knowledge chunks
 * @returns {{ contextText: string, sources: Array }}
 */
function buildContextBlock(patient, chunks) {
  const { allergies = [], currentMeds = [], newDrug } = patient;

  const lines = [
    "=== PATIENT CONTEXT ===",
    `Allergies      : ${allergies.length  ? allergies.join(", ")  : "none recorded"}`,
    `Current meds   : ${currentMeds.length ? currentMeds.join(", ") : "none recorded"}`,
    `New drug       : ${newDrug}`,
    "",
    "=== RETRIEVED CLINICAL KNOWLEDGE ===",
    `(${chunks.length} most relevant items retrieved by vector similarity search)`,
    "",
  ];

  chunks.forEach((c, i) => {
    lines.push(`[${i + 1}] ${c.title}  [type: ${c.type}, severity: ${c.metadata?.severity || "?"}]`);
    lines.push(c.content);
    lines.push("");
  });

  const sources = chunks.map(c => ({
    id:       c.id,
    title:    c.title,
    type:     c.type,
    severity: c.metadata?.severity || null,
    score:    Math.round(c.finalScore * 1000) / 1000,
  }));

  return { contextText: lines.join("\n"), sources };
}

// ── Legacy keyword search (kept for backward-compat & unit tests) ─────────────
const _legacyInteractions = require("./drugInteractions.json");

function legacyRetrieve(drugNames) {
  const names = drugNames.map(d => d.toLowerCase().trim());
  return _legacyInteractions.filter(row => {
    const a = names.some(n => row.drugA.includes(n) || n.includes(row.drugA));
    const b = names.some(n => row.drugB.includes(n) || n.includes(row.drugB));
    return a || b;
  });
}

module.exports = { retrieveChunks, buildContextBlock, buildQuery, legacyRetrieve };
