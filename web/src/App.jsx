import React, { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signOut,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase.js";
import AuthScreen from "./AuthScreen.jsx";
import RegisterScreen from "./RegisterScreen.jsx";
import PatientApp from "./PatientApp.jsx";
import DoctorApp from "./DoctorApp.jsx";

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            background: "linear-gradient(135deg, #0891B2, #0E7490)",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            fontWeight: 800,
            color: "#fff",
            margin: "0 auto 20px",
            boxShadow: "0 8px 24px rgba(8,145,178,.4)",
          }}
        >
          V
        </div>
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        <p className="spinner-text">Loading VORTEXA…</p>
      </div>
    </div>
  );
}

export default function App() {
  // undefined = loading, null = unauthenticated, object = firebase user
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null); // null | 'patient' | 'doctor' | 'pharmacist' | 'lab'
  const [profileLoading, setProfileLoading] = useState(false);

  // Handle email magic-link sign-in on page load
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const email =
        localStorage.getItem("vortexaEmailForSignIn") ||
        window.prompt("Please confirm your email to complete sign-in:");
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            localStorage.removeItem("vortexaEmailForSignIn");
            window.history.replaceState({}, "", window.location.pathname);
          })
          .catch(console.error);
      }
    }
  }, []);

  // Listen to Firebase Auth state
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u ?? null));
  }, []);

  // Resolve role + profile whenever user changes
  useEffect(() => {
    if (user === undefined) return; // still initializing
    if (!user) {
      setProfile(null);
      setRole(null);
      return;
    }
    resolveProfile(user.uid);
  }, [user]);

  const resolveProfile = async (uid) => {
    setProfileLoading(true);
    try {
      const [patSnap, provSnap] = await Promise.all([
        getDoc(doc(db, "patients", uid)),
        getDoc(doc(db, "providers", uid)),
      ]);

      if (patSnap.exists()) {
        setProfile({ id: uid, ...patSnap.data() });
        setRole("patient");
      } else if (provSnap.exists()) {
        const data = provSnap.data();
        setProfile({ id: uid, ...data });
        setRole(data.role); // "doctor" | "pharmacist" | "lab"
      } else {
        setProfile(null);
        setRole("unregistered");
      }
    } catch (err) {
      console.error("Profile resolve error:", err);
      setRole("unregistered");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSignOut = () => signOut(auth);

  // ── Render ─────────────────────────────────────────────────
  if (user === undefined || (user && profileLoading)) return <LoadingScreen />;
  if (user === null) return <AuthScreen />;
  if (role === "unregistered" || !role) {
    return (
      <RegisterScreen
        user={user}
        onComplete={(newRole, profileData) => {
          setProfile({ id: user.uid, ...profileData });
          setRole(newRole);
        }}
      />
    );
  }
  if (role === "patient") {
    return (
      <PatientApp
        user={user}
        profile={profile}
        onProfileUpdate={(updated) => setProfile((p) => ({ ...p, ...updated }))}
        onSignOut={handleSignOut}
      />
    );
  }
  // doctor | pharmacist | lab
  return (
    <DoctorApp
      user={user}
      profile={profile}
      onSignOut={handleSignOut}
    />
  );
}
