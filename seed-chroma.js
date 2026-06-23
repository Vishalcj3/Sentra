// seed-chroma.js
// Embeds the clinical knowledge base with the pure-JS hash embedder and writes
// it to the Chroma Cloud collection `ragKnowledge` — the RAG "details" store.
//
// Run with:  node seed-chroma.js
//
// Unlike seed-rag.js (Firestore), this needs NO serviceAccountKey.json — it
// talks straight to Chroma Cloud using the CHROMA_* credentials in
// functions/.env. Embeddings are produced offline (no API key, no cost), so
// this runs in seconds. Re-run whenever knowledgeBase.js changes.
//
// Patient PHI, signature photos and documents are NOT touched — they live in
// Firestore/Storage. Only the clinical knowledge details go to Chroma.

const knowledge = require("./functions/src/knowledgeBase");
const { embed } = require("./functions/src/hashEmbed");
const chromaDb = require("./functions/src/chromaDb");

async function seedChroma() {
  console.log(`Embedding ${knowledge.length} knowledge chunks with hash embedder…`);

  // Embed title + content + keywords together for a richer representation.
  const chunks = knowledge.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    keywords: item.keywords || [],
    metadata: item.metadata || {},
    embedding: embed(`${item.title}. ${item.content} ${(item.keywords || []).join(" ")}`),
  }));

  console.log(`Resetting Chroma collection "${chromaDb.COLLECTION}"…`);
  await chromaDb.reset();

  console.log("Upserting into Chroma Cloud…");
  const written = await chromaDb.upsertMany(chunks);
  const total = await chromaDb.count();

  // Sanity check: count by type.
  const byType = {};
  knowledge.forEach((k) => { byType[k.type] = (byType[k.type] || 0) + 1; });

  console.log("\nChroma RAG knowledge base seeded ✓");
  console.log(`Collection: ${chromaDb.COLLECTION}  (${written} upserted, ${total} now in Chroma, 256-dim hash embeddings, cosine)`);
  console.log("Breakdown by type:");
  Object.entries(byType).forEach(([t, n]) => console.log(`  ${t.padEnd(28)} ${n}`));
  console.log("\nRetrieval (rag.js) now queries Chroma Cloud. If Chroma is unreachable");
  console.log("at request time, it falls back to the in-memory knowledge base automatically.");
}

seedChroma()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Chroma seed failed:", err);
    process.exit(1);
  });
