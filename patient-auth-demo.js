// patient-auth-demo.js
// Enrolls one patient, then runs three verification attempts:
//   1. correct signature         → GRANT (method: signature)
//   2. "forgot sign" + right PIN  → GRANT (method: pin)
//   3. wrong signature + wrong PIN→ DENY
//
// Uses the chromaStore backend so it runs standalone with just functions/.env
// (no service account). Production verify() defaults to the faster firestoreStore,
// which auto-inits inside Cloud Functions.
// Run:  node patient-auth-demo.js
// (Demo data lives under id "PT-DEMO-0001"; call auth.revoke() or delete it after.)

const auth = require("./functions/src/patientAuth");
const store = auth.chromaStore; // standalone-friendly; omit in Functions for the Firestore fast path

async function main() {
  const patient = {
    patientId: "PT-DEMO-0001",
    signature: "sig::base64:MEUCIQD-demo-signature-blob==",
    pin: "4821",
  };

  console.log(`Enrolling ${patient.patientId} …`);
  await auth.enroll(patient, { store });

  console.log("\n1) Correct signature:");
  console.log("   ", await auth.verify({ patientId: patient.patientId, signature: patient.signature }, { store }));

  console.log('\n2) "Forgot sign" → PIN fallback:');
  console.log("   ", await auth.verify({ patientId: patient.patientId, pin: patient.pin }, { store }));

  console.log("\n3) Wrong signature + wrong PIN:");
  console.log("   ", await auth.verify({ patientId: patient.patientId, signature: "sig::bad", pin: "0000" }, { store }));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Demo failed:", err);
    process.exit(1);
  });
