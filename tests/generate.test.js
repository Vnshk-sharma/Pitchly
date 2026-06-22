const request = require('supertest');
const { authCookie } = require('./helpers/authCookie');

jest.mock('../services/geminiService', () => ({
  callGemini: jest.fn(),
  GEMINI_MODEL: 'gemini-2.5-flash-lite'
}));
jest.mock('../historyStore', () => ({
  addEntry: jest.fn().mockResolvedValue({ id: 'hist_123' }),
  getAll: jest.fn().mockResolvedValue([]),
  ping: jest.fn().mockResolvedValue(true)
}));

const { callGemini } = require('../services/geminiService');
const { createApp } = require('../app');

const validPayload = {
  platform: 'LinkedIn',
  tone: 'Friendly & direct',
  name: 'Alex',
  role: 'VP Engineering at Acme',
  reason: 'Saw their post about scaling infra',
  about: 'I build dev tools for platform teams',
  cta: 'Quick 15 min call',
  varCount: 1
};

describe('POST /api/generate', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/api/generate').send(validPayload);

    expect(res.status).toBe(401);
    expect(callGemini).not.toHaveBeenCalled();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/generate')
      .set('Cookie', authCookie())
      .send({ platform: 'LinkedIn' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid request/i);
    expect(callGemini).not.toHaveBeenCalled();
  });

  it('returns 400 for an unsupported platform', async () => {
    const res = await request(app)
      .post('/api/generate')
      .set('Cookie', authCookie())
      .send({ ...validPayload, platform: 'Carrier Pigeon' });

    expect(res.status).toBe(400);
  });

  it('generates a single variant on the happy path', async () => {
    callGemini.mockResolvedValue('Hey Alex, loved your post on scaling infra...');

    const res = await request(app)
      .post('/api/generate')
      .set('Cookie', authCookie())
      .send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.variants).toHaveLength(1);
    expect(res.body.variants[0]).toMatch(/Alex/);
    expect(res.body.historyId).toBe('hist_123');
  });

  it('splits multiple variants on the delimiter', async () => {
    callGemini.mockResolvedValue(
      'Variant one text---VARIANT---Variant two text---VARIANT---Variant three text'
    );

    const res = await request(app)
      .post('/api/generate')
      .set('Cookie', authCookie())
      .send({ ...validPayload, varCount: 3 });

    expect(res.status).toBe(200);
    expect(res.body.variants).toHaveLength(3);
    expect(res.body.variants[1]).toBe('Variant two text');
  });

  it('propagates Gemini errors with the correct status', async () => {
    const err = new Error('Gemini API error 429');
    err.status = 429;
    callGemini.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/generate')
      .set('Cookie', authCookie())
      .send(validPayload);

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/429/);
  });

  it('still returns the generated message if saving history fails', async () => {
    callGemini.mockResolvedValue('Some generated DM');
    const history = require('../historyStore');
    history.addEntry.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app)
      .post('/api/generate')
      .set('Cookie', authCookie())
      .send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.variants).toEqual(['Some generated DM']);
    expect(res.body.historyId).toBeNull();
  });

  it('scopes the saved history entry to the authenticated user', async () => {
    callGemini.mockResolvedValue('Some generated DM');
    const history = require('../historyStore');

    await request(app).post('/api/generate').set('Cookie', authCookie()).send(validPayload);

    expect(history.addEntry).toHaveBeenCalledWith(
      'user_test123',
      expect.objectContaining({ platform: validPayload.platform, tone: validPayload.tone })
    );
  });
});
