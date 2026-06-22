jest.mock('../db', () => ({ getDb: jest.fn() }));

// Minimal in-memory stand-in for the Firestore methods userStore.js uses
// (collection/doc/get/set/delete + runTransaction with create/set).
function createMockFirestore() {
  const stores = {}; // collectionName -> Map(docId -> data)

  function getStore(name) {
    if (!stores[name]) stores[name] = new Map();
    return stores[name];
  }

  function makeDocRef(collectionName, id) {
    return {
      id,
      _collectionName: collectionName,
      _id: id,
      async get() {
        const store = getStore(collectionName);
        const exists = store.has(id);
        return { exists, data: () => (exists ? store.get(id) : undefined) };
      },
      async set(data) {
        getStore(collectionName).set(id, data);
      },
      async delete() {
        getStore(collectionName).delete(id);
      }
    };
  }

  function makeCollection(name) {
    return { doc: (id) => makeDocRef(name, id) };
  }

  const db = {
    collection: jest.fn((name) => makeCollection(name)),
    runTransaction: jest.fn(async (fn) => {
      const tx = {
        create(ref, data) {
          const store = getStore(ref._collectionName);
          if (store.has(ref._id)) {
            const err = new Error(`ALREADY_EXISTS: Document already exists: ${ref._id}`);
            err.code = 6;
            throw err;
          }
          store.set(ref._id, data);
        },
        set(ref, data) {
          getStore(ref._collectionName).set(ref._id, data);
        }
      };
      return fn(tx);
    })
  };

  return { db, getStore };
}

describe('userStore', () => {
  let mockFirestore;
  let users;

  beforeEach(() => {
    jest.resetModules();
    // Re-require after resetModules so this is the same mock instance userStore.js
    // itself will pick up internally — resetModules clears the registry, so a
    // reference captured before it would point at a stale, disconnected mock.
    const { getDb } = require('../db');
    mockFirestore = createMockFirestore();
    getDb.mockReturnValue(mockFirestore.db);
    users = require('../userStore');
  });

  describe('createUser', () => {
    it('hashes the password and never returns it', async () => {
      const user = await users.createUser({ email: 'Jane@Example.com', password: 'plaintext123' });

      expect(user.email).toBe('jane@example.com'); // normalized to lowercase
      expect(user.passwordHash).toBeUndefined();

      const stored = mockFirestore.getStore('users').get(user.id);
      expect(stored.passwordHash).not.toBe('plaintext123');
      expect(stored.passwordHash.length).toBeGreaterThan(20);
    });

    it('rejects a duplicate email with a 409', async () => {
      await users.createUser({ email: 'dup@example.com', password: 'plaintext123' });

      await expect(
        users.createUser({ email: 'dup@example.com', password: 'other123' })
      ).rejects.toMatchObject({
        status: 409
      });
    });
  });

  describe('verifyCredentials', () => {
    it('returns null for an unknown email', async () => {
      const result = await users.verifyCredentials('nobody@example.com', 'whatever123');
      expect(result).toBeNull();
    });

    it('returns null for a known email with the wrong password', async () => {
      await users.createUser({ email: 'real@example.com', password: 'correctpassword' });

      const result = await users.verifyCredentials('real@example.com', 'wrongpassword');
      expect(result).toBeNull();
    });

    it('returns the public user for correct credentials', async () => {
      await users.createUser({ email: 'real@example.com', password: 'correctpassword' });

      const result = await users.verifyCredentials('REAL@example.com', 'correctpassword');
      expect(result).toMatchObject({ email: 'real@example.com' });
      expect(result.passwordHash).toBeUndefined();
    });
  });

  describe('getUserById', () => {
    it('returns null when no user matches', async () => {
      const result = await users.getUserById('does-not-exist');
      expect(result).toBeNull();
    });
  });
});
