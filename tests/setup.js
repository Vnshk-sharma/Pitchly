// Runs before every test file. Provides dummy required env vars so
// validateEnv()-style checks don't fail in CI, without ever touching
// real API keys or a real database.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-not-used-in-production';
process.env.FIREBASE_SERVICE_ACCOUNT_KEY =
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
  JSON.stringify({
    project_id: 'test-project-not-used',
    client_email: 'test@test-project-not-used.iam.gserviceaccount.com',
    private_key: 'test-key-not-used'
  });
process.env.NODE_ENV = 'test';
