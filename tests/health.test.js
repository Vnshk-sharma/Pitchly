const request = require('supertest');

jest.mock('../historyStore', () => ({
  ping: jest.fn().mockResolvedValue(true)
}));

const { createApp } = require('../app');

describe('GET /health', () => {
  it('reports db as connected when historyStore.ping succeeds', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(res.body.model).toBeDefined();
  });

  it('reports a db error when historyStore.ping rejects', async () => {
    const history = require('../historyStore');
    history.ping.mockRejectedValueOnce(new Error('auth failed'));

    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.db).toMatch(/error/i);
  });

  it('does not require authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).not.toBe(401);
  });
});
