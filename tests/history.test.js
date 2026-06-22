const request = require('supertest');
const { authCookie } = require('./helpers/authCookie');

jest.mock('../historyStore', () => ({
  getAll: jest.fn(),
  deleteById: jest.fn(),
  clearAll: jest.fn(),
  ping: jest.fn().mockResolvedValue(true)
}));

const history = require('../historyStore');
const { createApp } = require('../app');

describe('History routes', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  it('returns 401 for all routes when not authenticated', async () => {
    const res = await request(app).get('/api/history');
    expect(res.status).toBe(401);
  });

  it('GET /api/history returns saved items for the authenticated user', async () => {
    history.getAll.mockResolvedValue([{ id: 'a1', platform: 'LinkedIn' }]);

    const res = await request(app).get('/api/history').set('Cookie', authCookie());

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(history.getAll).toHaveBeenCalledWith('user_test123');
  });

  it('DELETE /api/history/:id returns 404 for an unknown id', async () => {
    history.deleteById.mockResolvedValue(false);

    const res = await request(app)
      .delete('/api/history/does-not-exist')
      .set('Cookie', authCookie());

    expect(res.status).toBe(404);
  });

  it('DELETE /api/history/:id returns success for a known id, scoped to the user', async () => {
    history.deleteById.mockResolvedValue(true);

    const res = await request(app).delete('/api/history/a1').set('Cookie', authCookie());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(history.deleteById).toHaveBeenCalledWith('a1', 'user_test123');
  });

  it('DELETE /api/history clears everything for the authenticated user only', async () => {
    history.clearAll.mockResolvedValue();

    const res = await request(app).delete('/api/history').set('Cookie', authCookie());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(history.clearAll).toHaveBeenCalledWith('user_test123');
  });
});
