// index.js
// Entry point. Initializes admin SDK once, re-exports every function so
// `firebase deploy` picks them all up.

const { initializeApp } = require("firebase-admin/app");
initializeApp();

const { runSafetyCheck } = require("./src/safetyAgent");
const { hermesScheduledRun } = require("./src/hermesAgent");
const {
  bookAppointment,
  createFollowup,
  askSafetyAgent,
  createDoseSchedule,
  logDose,
  getAdherenceSummary,
} = require("./src/api");
const { hermesChat } = require("./src/chatAgent");

module.exports = {
  runSafetyCheck,
  hermesScheduledRun,
  bookAppointment,
  createFollowup,
  askSafetyAgent,
  createDoseSchedule,
  logDose,
  getAdherenceSummary,
  hermesChat,
};
