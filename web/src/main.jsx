import React from "react";
import ReactDOM from "react-dom/client";

// "/"     → static product showcase (mock data, no Firebase needed)
// "/app"  → the live Firebase app (auth, Firestore, Cloud Functions)
const isLiveApp = window.location.pathname.startsWith("/app");

async function boot() {
  const root = ReactDOM.createRoot(document.getElementById("root"));
  if (isLiveApp) {
    await import("./index.css");
    const { default: App } = await import("./App.jsx");
    root.render(<React.StrictMode><App /></React.StrictMode>);
  } else {
    await import("./showcase/showcase.css");
    const { default: Showcase } = await import("./showcase/Showcase.jsx");
    root.render(<React.StrictMode><Showcase /></React.StrictMode>);
  }
}

boot();
