const admin = require('firebase-admin');

let firestoreInstance = null;

// Builds the Admin SDK credential from either a single JSON env var
// (FIREBASE_SERVICE_ACCOUNT_KEY — easiest to paste as one Vercel env var) or
// three separate env vars (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
// FIREBASE_PRIVATE_KEY — easier to manage locally in a .env file).
function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch (err) {
      throw Object.assign(
        new Error('FIREBASE_SERVICE_ACCOUNT_KEY is set but is not valid JSON.'),
        { status: 500 }
      );
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw Object.assign(
      new Error(
        'Server is missing Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT_KEY, or all of ' +
          'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY. Check your .env ' +
          'file (or your deployment platform env vars).'
      ),
      { status: 500 }
    );
  }

  return {
    projectId,
    clientEmail,
    // .env files (and most platform env-var UIs) store the key with literal
    // "\n" escapes since real newlines break naive .env parsing — convert
    // them back to real newlines before handing the key to the SDK.
    privateKey: privateKey.replace(/\\n/g, '\n')
  };
}

// Reuse a single Admin app / Firestore instance across requests (important in
// serverless: avoids re-initializing the SDK on every invocation / cold
// start). Shared by every store (historyStore, userStore, ...) so the whole
// app uses one connection.
function getDb() {
  if (!firestoreInstance) {
    if (!admin.apps.length) {
      const serviceAccount = loadServiceAccount();
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    firestoreInstance = admin.firestore();
  }
  return firestoreInstance;
}

module.exports = { getDb };
