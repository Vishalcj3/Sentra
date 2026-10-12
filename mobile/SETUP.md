# VORTEXA Mobile — Setup Guide

## Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Android Studio (for Android emulator) OR physical device with Expo Go

## 1. Install dependencies
```bash
cd mobile
npm install
```

## 2. Add Firebase config files
### Android
- Download `google-services.json` from Firebase Console > Project Settings > Android
- Place at: `android/app/google-services.json`

### iOS (if building for iOS)
- Download `GoogleService-Info.plist` from Firebase Console > Project Settings > iOS
- Place at: `ios/GoogleService-Info.plist`

## 3. Run on device / emulator

### Expo Go (easiest — no Firebase native modules)
```bash
npx expo start
```
Scan the QR code with Expo Go on your phone.

> **Note:** @react-native-firebase/* requires a development build, not Expo Go.

### Development build (required for Firebase)
```bash
npx expo install expo-dev-client
npx expo run:android    # or run:ios
```

## 4. E2E Encryption
- Keypair generated automatically on user registration
- Private key stored in device SecureStore (never leaves device)
- Public key stored in Firestore at `users/{uid}/publicKey`
- Prescription fields (drugName, dosage, frequency, notes) are encrypted
  before upload and decrypted client-side on the patient's device

## 5. Firebase services required
Enable in Firebase Console (vortexa-d430e):
- Authentication > Phone (SMS OTP)
- Authentication > Email link (passwordless)
- Firestore Database (production mode)
- Cloud Functions (already deployed via backend)

## File structure
```
vortexa-mobile/
  App.js                    — root navigator, auth state
  babel.config.js
  app.json                  — Expo config
  src/
    firebase.js             — Firebase init (auto via native modules)
    crypto.js               — E2E encryption (tweetnacl + SecureStore)
    screens/
      AuthScreen.js         — Phone OTP + Email magic link
      RegisterScreen.js     — Role picker + profile form
    patient/
      PatientApp.js         — Vault, Appointments, Alerts, Security tabs
    doctor/
      DoctorApp.js          — Patients, Prescribe, Queue tabs
    styles/
      theme.js              — Design tokens, shared styles
```
