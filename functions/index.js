const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions, logger } = require("firebase-functions/v2");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { createApp } = require("./app");
const { createStore } = require("./lib/store");
const { createPayments } = require("./lib/payments");

setGlobalOptions({ maxInstances: 10, region: "asia-southeast1" });

if (getApps().length === 0) initializeApp();
const firestore = getFirestore();

// Users sign in with Firebase Authentication of this same project (public/firebase-init.js).
const authVerifier = getAuth();

// Stripe test mode is enabled by STRIPE_SECRET_KEY in functions/.env (not committed).
// The local emulator uses the simulated payment unless USE_STRIPE_IN_EMULATOR=true.
const stripeAllowed = process.env.FUNCTIONS_EMULATOR !== "true" || process.env.USE_STRIPE_IN_EMULATOR === "true";
const payments = createPayments({ secretKey: stripeAllowed ? process.env.STRIPE_SECRET_KEY : "" });

const app = createApp({
  firestore,
  payments,
  verifyIdToken: (token) => authVerifier.verifyIdToken(token),
  adminEmails: process.env.ADMIN_EMAILS,
  logger,
});

exports.api = onRequest({ invoker: "public" }, app);

// Release seats whose payment window has passed (reads also ignore expired holds,
// this just keeps booking statuses tidy for reports).
exports.releaseExpiredHolds = onSchedule({ schedule: "every 5 minutes", timeZone: "Asia/Bangkok" }, async () => {
  const expired = await createStore(firestore, { payments }).expireOverdueHolds();
  if (expired) logger.info(`Expired ${expired} unpaid booking(s)`);
});
