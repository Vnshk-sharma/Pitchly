const express = require('express');
const users = require('../userStore');
const { validateBody, signupSchema, loginSchema } = require('../middleware/validate');
const { asyncHandler } = require('../middleware/errorHandler');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/signup',
  validateBody(signupSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await users.createUser({ email, password });

    const token = signToken(user);
    setAuthCookie(res, token);

    res.status(201).json({ user });
  })
);

router.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await users.verifyCredentials(email, password);

    if (!user) {
      // Deliberately generic — never reveal whether the email itself was the
      // problem, to avoid leaking which emails have accounts.
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken(user);
    setAuthCookie(res, token);

    res.json({ user });
  })
);

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await users.getUserById(req.user.id);
    if (!user) {
      // Token is valid but the account no longer exists (e.g. deleted) — treat
      // as logged out rather than a server error.
      clearAuthCookie(res);
      return res.status(401).json({ error: 'Session is no longer valid. Please log in again.' });
    }
    res.json({ user });
  })
);

module.exports = router;
