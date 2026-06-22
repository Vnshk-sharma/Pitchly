const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

const USERS_COLLECTION = 'users';
// Doc id = normalized email. This collection holds nothing but a pointer to
// the real user id — its only job is to let us atomically enforce "one
// account per email," since Firestore (unlike Mongo) has no unique index on
// arbitrary fields, only on the document id.
const EMAILS_COLLECTION = 'userEmails';
const SALT_ROUNDS = 12;

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

// Never leak passwordHash to the rest of the app/frontend.
function toPublicUser(doc) {
  if (!doc) return null;
  return { id: doc.id, email: doc.email, createdAt: doc.createdAt };
}

async function createUser({ email, password }) {
  const db = getDb();
  const normalizedEmail = normalizeEmail(email);
  const id = genId();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = {
    id,
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString()
  };

  const emailRef = db.collection(EMAILS_COLLECTION).doc(normalizedEmail);
  const userRef = db.collection(USERS_COLLECTION).doc(id);

  try {
    // Run both writes in a transaction so "reserve the email" and "create the
    // user" succeed or fail together. tx.create() throws if the email doc
    // already exists, which is what makes this safe against two concurrent
    // signups for the same email landing at once.
    await db.runTransaction(async (tx) => {
      tx.create(emailRef, { userId: id, createdAt: user.createdAt });
      tx.set(userRef, user);
    });
  } catch (err) {
    if (err.code === 6 || /already exists/i.test(err.message || '')) {
      const dupErr = new Error('An account with that email already exists.');
      dupErr.status = 409;
      throw dupErr;
    }
    throw err;
  }

  return toPublicUser(user);
}

// Returns the public user on success, or null on bad email/password (deliberately
// generic — never reveal whether the email exists at all).
async function verifyCredentials(email, password) {
  const db = getDb();
  const normalizedEmail = normalizeEmail(email);

  const emailDoc = await db.collection(EMAILS_COLLECTION).doc(normalizedEmail).get();
  if (!emailDoc.exists) return null;

  const userDoc = await db.collection(USERS_COLLECTION).doc(emailDoc.data().userId).get();
  if (!userDoc.exists) return null;

  const user = userDoc.data();
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return toPublicUser(user);
}

async function getUserById(id) {
  const db = getDb();
  const doc = await db.collection(USERS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return toPublicUser(doc.data());
}

module.exports = {
  createUser,
  verifyCredentials,
  getUserById
};
