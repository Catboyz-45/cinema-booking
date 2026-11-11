/**
 * Vercel serverless entry: runs the same Express API as functions/index.js
 * (Firebase Cloud Functions needs the paid Blaze plan; Vercel Hobby is free).
 *
 * Environment variables (Vercel → Project → Settings → Environment Variables):
 *   FIREBASE_SERVICE_ACCOUNT  service-account JSON of the Firebase project (raw JSON or base64)
 *   ADMIN_EMAILS              comma-separated emails that become admin on first sign-in
 *   STRIPE_SECRET_KEY         Stripe test key (sk_test_...), optional
 *   ALLOWED_ORIGINS           extra site origins Stripe may redirect back to, optional
 *   CRON_SECRET               protects /api/cron/release-holds (Vercel Cron sends it)
 */
const express = require("express");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { createApp } = require("../functions/app");
const { createStore } = require("../functions/lib/store");
const { createPayments } = require("../functions/lib/payments");

function serviceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json);
}

let handler = null;

function build() {
  const account = serviceAccount();
  const adminApp = getApps()[0] || initializeApp({ credential: cert(account), projectId: account.project_id });
  const firestore = getFirestore(adminApp);
  const authVerifier = getAuth(adminApp);
  const payments = createPayments();

  const app = express();

  // Vercel Cron (vercel.json) — the Hobby plan runs it once a day. Seat maps already
  // ignore expired holds on every read; this only tidies booking statuses for reports.
  app.get("/api/cron/release-holds", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.get("authorization") !== `Bearer ${secret}`) {
      res.status(401).json({ message: "unauthorized" });
      return;
    }
    const expired = await createStore(firestore, { payments }).expireOverdueHolds();
    res.json({ expired });
  });

  app.use(createApp({
    firestore,
    payments,
    verifyIdToken: (token) => authVerifier.verifyIdToken(token),
    adminEmails: process.env.ADMIN_EMAILS,
  }));
  return app;
}

module.exports = (req, res) => {
  try {
    if (!handler) handler = build();
  } catch (error) {
    console.error("API setup failed:", error.message);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "เซิร์ฟเวอร์ยังตั้งค่าไม่ครบ" }));
    return;
  }
  handler(req, res);
};
