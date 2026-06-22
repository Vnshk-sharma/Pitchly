const { FieldValue } = require('firebase-admin/firestore');
const { getDb } = require('./db');

const MAX_ITEMS = 200; // keep each user's history from growing unbounded
const COLLECTION_NAME = 'history';

function genId() {
  // Keep using our own short string IDs (not Firestore's auto-id) so the rest
  // of the app and the frontend don't need to change how they reference entries.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function collection() {
  return getDb().collection(COLLECTION_NAME);
}

function toPublicEntry(doc) {
  if (!doc) return null;
  // eslint-disable-next-line no-unused-vars
  const { userId, ...rest } = doc;
  return rest;
}

// Add one history entry per generated request (it may contain multiple variants).
// Always scoped to the authenticated user. Returns the saved entry.
async function addEntry(userId, { platform, tone, name, role, reason, about, cta, variants }) {
  const col = collection();
  const id = genId();

  const entry = {
    id,
    userId,
    createdAt: new Date().toISOString(),
    platform,
    tone,
    name: name || '',
    role: role || '',
    reason: reason || '',
    about: about || '',
    cta: cta || '',
    variants: Array.isArray(variants) ? variants : [],
    followUps: [] // { id, createdAt, baseVariantIndex, text }
  };

  await col.doc(id).set(entry);

  // Trim this user's oldest entries beyond MAX_ITEMS so the collection doesn't
  // grow unbounded per user. select() with no args skips field data, keeping
  // this cheap — we only need the count and doc refs.
  const existing = await col.where('userId', '==', userId).select().get();
  if (existing.size > MAX_ITEMS) {
    const excess = existing.size - MAX_ITEMS;
    const oldest = await col
      .where('userId', '==', userId)
      .orderBy('createdAt', 'asc')
      .limit(excess)
      .get();
    if (!oldest.empty) {
      const batch = getDb().batch();
      oldest.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  return toPublicEntry(entry);
}

async function getAll(userId) {
  const col = collection();
  // Requires a composite index on (userId asc, createdAt desc) — Firestore
  // will log an error with a one-click link to create it the first time this
  // runs against a fresh project. See README for details.
  const snap = await col
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(MAX_ITEMS)
    .get();
  return snap.docs.map((d) => toPublicEntry(d.data()));
}

// Scoped to userId so one user can never read another user's history entry,
// even if they somehow guess/leak a valid id.
async function getById(id, userId) {
  const col = collection();
  const doc = await col.doc(id).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (data.userId !== userId) return null;
  return toPublicEntry(data);
}

async function deleteById(id, userId) {
  const col = collection();
  const ref = col.doc(id);
  const doc = await ref.get();
  if (!doc.exists || doc.data().userId !== userId) return false;
  await ref.delete();
  return true;
}

async function clearAll(userId) {
  const col = collection();
  const snap = await col.where('userId', '==', userId).get();
  if (snap.empty) return;

  // Firestore batches cap at 500 writes — chunk in case a user has a lot of history.
  for (let i = 0; i < snap.docs.length; i += 500) {
    const chunk = snap.docs.slice(i, i + 500);
    const batch = getDb().batch();
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

// Attach a generated follow-up message to an existing history entry owned by userId.
async function addFollowUp(id, userId, { baseVariantIndex, text }) {
  const col = collection();
  const ref = col.doc(id);
  const doc = await ref.get();
  if (!doc.exists || doc.data().userId !== userId) return null;

  const followUp = {
    id: genId(),
    createdAt: new Date().toISOString(),
    baseVariantIndex: typeof baseVariantIndex === 'number' ? baseVariantIndex : 0,
    text
  };

  await ref.update({ followUps: FieldValue.arrayUnion(followUp) });

  return followUp;
}

// Lightweight connectivity check for /health — doesn't require a userId.
async function ping() {
  const col = collection();
  await col.limit(1).get();
  return true;
}

module.exports = {
  addEntry,
  getAll,
  getById,
  deleteById,
  clearAll,
  addFollowUp,
  ping
};
