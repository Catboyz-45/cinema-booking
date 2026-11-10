/**
 * Local development server: serves public/ and the same API as Firebase Functions.
 *
 *   FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json npm start
 *
 * Without a service-account file it uses Application Default Credentials, or the
 * Firestore emulator when FIRESTORE_EMULATOR_HOST is set.
 */
const path = require("path");
const fs = require("fs");
const express = require("express");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { createApp } = require("./functions/app");
const { createStore } = require("./functions/lib/store");
const { createPayments } = require("./functions/lib/payments");

const PORT = process.env.PORT || 3000;

function initAdmin() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath) {
    const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), "utf8"));
    return initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
  }
  return initializeApp(process.env.GCLOUD_PROJECT ? { projectId: process.env.GCLOUD_PROJECT } : undefined);
}

const adminApp = getApps()[0] || initAdmin();
const firestore = getFirestore(adminApp);
const authVerifier = getAuth(adminApp);

const payments = createPayments(); // STRIPE_SECRET_KEY (test mode) from the environment

const app = express();
app.use(createApp({
  firestore,
  payments,
  verifyIdToken: (token) => authVerifier.verifyIdToken(token),
  adminEmails: process.env.ADMIN_EMAILS,
}));
app.use(express.static(path.join(__dirname, "public")));
app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, "public", "404.html")));

setInterval(() => {
  createStore(firestore, { payments }).expireOverdueHolds().catch((error) => console.warn("expire holds:", error.message));
}, 5 * 60 * 1000).unref();

if (require.main === module) {
  app.listen(PORT, () => console.log(`Cinema server running at http://localhost:${PORT}`));
}

module.exports = app;
