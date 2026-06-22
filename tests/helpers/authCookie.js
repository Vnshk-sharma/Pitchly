const jwt = require('jsonwebtoken');

const TEST_USER = { sub: 'user_test123', email: 'test@example.com' };

// Builds a `Cookie:` header value with a validly-signed session token, so
// tests for protected routes can authenticate without going through the
// real signup/login flow.
function authCookie(payload = TEST_USER) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  return `colddm_token=${token}`;
}

module.exports = { authCookie, TEST_USER };
