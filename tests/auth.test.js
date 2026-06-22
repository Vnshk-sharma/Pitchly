const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../userStore', () => ({
  createUser: jest.fn(),
  verifyCredentials: jest.fn(),
  getUserById: jest.fn()
}));

const users = require('../userStore');
const { createApp } = require('../app');

const VALID_SIGNUP = { email: 'new.user@example.com', password: 'supersecret123' };

// Pulls the signed JWT out of a Set-Cookie response header so tests can
// inspect its payload directly.
function extractToken(res) {
  const cookieHeader = res.headers['set-cookie']?.find((c) => c.startsWith('colddm_token='));
  if (!cookieHeader) return null;
  return cookieHeader.split(';')[0].split('=')[1];
}

describe('Auth routes', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  describe('POST /api/auth/signup', () => {
    it('returns 400 for an invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'not-an-email', password: 'supersecret123' });

      expect(res.status).toBe(400);
      expect(users.createUser).not.toHaveBeenCalled();
    });

    it('returns 400 for a password under 8 characters', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'a@example.com', password: 'short' });

      expect(res.status).toBe(400);
      expect(users.createUser).not.toHaveBeenCalled();
    });

    it('creates a user, sets an httpOnly session cookie, and returns the public user', async () => {
      const user = {
        id: 'user_abc',
        email: VALID_SIGNUP.email,
        createdAt: new Date().toISOString()
      };
      users.createUser.mockResolvedValue(user);

      const res = await request(app).post('/api/auth/signup').send(VALID_SIGNUP);

      expect(res.status).toBe(201);
      expect(res.body.user).toEqual(user);
      expect(res.body.user.passwordHash).toBeUndefined();

      const setCookie = res.headers['set-cookie']?.[0] || '';
      expect(setCookie).toMatch(/colddm_token=/);
      expect(setCookie).toMatch(/HttpOnly/i);

      const token = extractToken(res);
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      expect(payload.sub).toBe('user_abc');
    });

    it('returns 409 when the email is already taken', async () => {
      const err = new Error('An account with that email already exists.');
      err.status = 409;
      users.createUser.mockRejectedValue(err);

      const res = await request(app).post('/api/auth/signup').send(VALID_SIGNUP);

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns 401 with a generic message for unknown email', async () => {
      users.verifyCredentials.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid email or password/i);
    });

    it('returns 401 with the same generic message for a wrong password', async () => {
      users.verifyCredentials.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: VALID_SIGNUP.email, password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid email or password/i);
    });

    it('sets a session cookie and returns the user on success', async () => {
      const user = {
        id: 'user_abc',
        email: VALID_SIGNUP.email,
        createdAt: new Date().toISOString()
      };
      users.verifyCredentials.mockResolvedValue(user);

      const res = await request(app).post('/api/auth/login').send(VALID_SIGNUP);

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(user);
      expect(extractToken(res)).toBeTruthy();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const setCookie = res.headers['set-cookie']?.[0] || '';
      // clearCookie sets an expired/empty cookie of the same name.
      expect(setCookie).toMatch(/colddm_token=;/);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 with no session cookie', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 for a tampered/invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', 'colddm_token=not-a-real-jwt');
      expect(res.status).toBe(401);
    });

    it('returns the current user for a valid session', async () => {
      const user = {
        id: 'user_abc',
        email: VALID_SIGNUP.email,
        createdAt: new Date().toISOString()
      };
      users.getUserById.mockResolvedValue(user);
      const token = jwt.sign(
        { sub: 'user_abc', email: VALID_SIGNUP.email },
        process.env.JWT_SECRET
      );

      const res = await request(app).get('/api/auth/me').set('Cookie', `colddm_token=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(user);
    });

    it('returns 401 if the account behind a valid token no longer exists', async () => {
      users.getUserById.mockResolvedValue(null);
      const token = jwt.sign(
        { sub: 'deleted_user', email: 'gone@example.com' },
        process.env.JWT_SECRET
      );

      const res = await request(app).get('/api/auth/me').set('Cookie', `colddm_token=${token}`);

      expect(res.status).toBe(401);
    });
  });
});
