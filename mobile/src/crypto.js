/**
 * E2E Encryption for VORTEXA
 *
 * Protocol: NaCl box (X25519 key exchange + XSalsa20-Poly1305 AEAD)
 * - Each user gets a keypair on registration
 * - Public key stored in Firestore (users/{uid}/publicKey) — base64
 * - Secret key stored in device SecureStore — never leaves the device
 * - Prescription & consent fields encrypted with recipient's public key
 * - Only the recipient's private key can decrypt
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import * as SecureStore from 'expo-secure-store';
import firestore from '@react-native-firebase/firestore';

const SECRET_KEY_STORE = 'vortexa_e2e_secretKey';

// ── Key management ────────────────────────────────────────────────────────────

export async function generateAndStoreKeyPair(uid) {
  const kp = nacl.box.keyPair();
  await SecureStore.setItemAsync(SECRET_KEY_STORE, encodeBase64(kp.secretKey));
  await firestore().collection('users').doc(uid).set(
    { publicKey: encodeBase64(kp.publicKey) },
    { merge: true }
  );
  return { publicKey: encodeBase64(kp.publicKey) };
}

export async function getMySecretKey() {
  const stored = await SecureStore.getItemAsync(SECRET_KEY_STORE);
  if (!stored) return null;
  return decodeBase64(stored);
}

export async function getPublicKey(uid) {
  const snap = await firestore().collection('users').doc(uid).get();
  const pk = snap.data()?.publicKey;
  if (!pk) return null;
  return decodeBase64(pk);
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Encrypt a string for a recipient.
 * @param {string} plaintext
 * @param {Uint8Array} recipientPublicKey
 * @param {Uint8Array} senderSecretKey
 * @returns {{ ciphertext: string, nonce: string }} base64-encoded
 */
export function encryptForRecipient(plaintext, recipientPublicKey, senderSecretKey) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const message = encodeUTF8(plaintext);
  const ciphertext = nacl.box(message, nonce, recipientPublicKey, senderSecretKey);
  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
    encrypted: true,
  };
}

/**
 * Decrypt a ciphertext from a sender.
 * @param {{ ciphertext: string, nonce: string }} payload
 * @param {Uint8Array} senderPublicKey
 * @param {Uint8Array} recipientSecretKey
 * @returns {string} plaintext or null on failure
 */
export function decryptFromSender(payload, senderPublicKey, recipientSecretKey) {
  if (!payload?.encrypted) return payload?.ciphertext ?? payload;
  try {
    const ciphertext = decodeBase64(payload.ciphertext);
    const nonce = decodeBase64(payload.nonce);
    const decrypted = nacl.box.open(ciphertext, nonce, senderPublicKey, recipientSecretKey);
    if (!decrypted) return '[decryption failed]';
    return decodeUTF8(decrypted);
  } catch {
    return '[decryption error]';
  }
}

// ── Prescription helpers ──────────────────────────────────────────────────────

/**
 * Encrypt sensitive prescription fields before writing to Firestore.
 * Fields encrypted: drugName, dosage, frequency, notes
 */
export async function encryptPrescription(rx, patientUid, providerUid) {
  const [patientPK, mySecretKey] = await Promise.all([
    getPublicKey(patientUid),
    getMySecretKey(),
  ]);
  if (!patientPK || !mySecretKey) return rx;

  const sensitiveFields = ['drugName', 'dosage', 'frequency', 'notes'];
  const encrypted = { ...rx, encryptedBy: providerUid };
  for (const field of sensitiveFields) {
    if (rx[field]) {
      encrypted[field] = encryptForRecipient(String(rx[field]), patientPK, mySecretKey);
    }
  }
  return encrypted;
}

/**
 * Decrypt prescription fields. Called when patient views their prescriptions.
 */
export async function decryptPrescription(rx, providerUid) {
  if (!rx.encryptedBy) return rx;
  const [providerPK, mySecretKey] = await Promise.all([
    getPublicKey(providerUid || rx.encryptedBy),
    getMySecretKey(),
  ]);
  if (!providerPK || !mySecretKey) return rx;

  const sensitiveFields = ['drugName', 'dosage', 'frequency', 'notes'];
  const decrypted = { ...rx };
  for (const field of sensitiveFields) {
    if (rx[field]?.encrypted) {
      decrypted[field] = decryptFromSender(rx[field], providerPK, mySecretKey);
    }
  }
  return decrypted;
}

// ── Consent helpers ───────────────────────────────────────────────────────────

export async function encryptConsentScope(scope, patientUid, providerSecretKey) {
  const patientPK = await getPublicKey(patientUid);
  if (!patientPK) return scope;
  return encryptForRecipient(scope, patientPK, providerSecretKey);
}

// ── Symmetric helper (for local data) ────────────────────────────────────────

export function symmetricEncrypt(plaintext, keyBase64) {
  const key = decodeBase64(keyBase64).slice(0, nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(encodeUTF8(plaintext), nonce, key);
  return { ciphertext: encodeBase64(box), nonce: encodeBase64(nonce), encrypted: true };
}

export function symmetricDecrypt(payload, keyBase64) {
  if (!payload?.encrypted) return payload;
  const key = decodeBase64(keyBase64).slice(0, nacl.secretbox.keyLength);
  const opened = nacl.secretbox.open(decodeBase64(payload.ciphertext), decodeBase64(payload.nonce), key);
  return opened ? decodeUTF8(opened) : '[decrypt failed]';
}
