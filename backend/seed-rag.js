// seed-rag.js
// Embeds the clinical knowledge base and writes it to Firestore `ragKnowledge/`
// as native vector values, ready for findNearest() vector search.
//
// Run with:  node seed-rag.js
// Requires a serviceAccountKey.json in this folder (download from
// Firebase Console > Project Settings > Service Accounts > Generate key).
//
// Run ONCE (or whenever knowledgeBase.js changes). The embeddings are
// produced by the pure-JS hash embedder (no API key, no cost), so this
// runs offline in seconds.
//
// After seeding, deploy the vector index so findNearest() works:
//   firebase deploy --only firestore:indexes

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const knowledge = require("./functions/src/knowledgeBase");
const { embed } = require("./functions/src/hashEmbed");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const COLLECTION = "ragKnowledge";

async function clearExisting() {
  const snap = await db.collection(COLLECTION).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

async function seedRag() {
  console.log(`Embedding ${knowledge.length} knowledge chunks with hash embedder…`);

  const cleared = await clearExisting();
  if (cleared) console.log(`Cleared ${cleared} existing chunks.`);

  // Firestore batches cap at 500 writes; we're well under, but chunk anyway.
  const BATCH_SIZE = 400;
  let written = 0;

  for (let i = 0; i < knowledge.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = knowledge.slice(i, i + BATCH_SIZE);

    for (const item of slice) {
      // Embed title + content + keywords together for a richer representation.
      const embedText = `${item.title}. ${item.content} ${(item.keywords || []).join(" ")}`;
      const vector = embed(embedText);

      const ref = db.collection(COLLECTION).doc(item.id);
      batch.set(ref, {
        type: item.type,
        title: item.title,
        content: item.content,
        keywords: item.keywords || [],
        metadata: item.metadata || {},
        embedding: FieldValue.vector(vector),
        embedDim: vector.length,
        updatedAt: new Date(),
      });
    }

    await batch.commit();
    written += slice.length;
    console.log(`  …${written}/${knowledge.length} written`);
  }

  // Quick sanity check: count by type
  const byType = {};
  knowledge.forEach((k) => { byType[k.type] = (byType[k.type] || 0) + 1; });

  console.log("\nRAG knowledge base seeded ✓");
  console.log(`Collection: ${COLLECTION}  (${written} chunks, 256-dim hash embeddings)`);
  console.log("Breakdown by type:");
  Object.entries(byType).forEach(([t, n]) => console.log(`  ${t.padEnd(28)} ${n}`));
  console.log("\nNext: firebase deploy --only firestore:indexes   (enables findNearest)");
  console.log("Until the index is live, the app falls back to in-memory cosine search automatically.");
}

seedRag()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("RAG seed failed:", err);
    process.exit(1);
  });
