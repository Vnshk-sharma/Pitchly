// Validates required environment variables at process startup.
// Fails fast with a clear message instead of letting requests fail
// one-by-one with confusing errors later.

const ALWAYS_REQUIRED = ['GEMINI_API_KEY', 'JWT_SECRET'];

// Firebase credentials can be supplied either as one JSON blob
// (FIREBASE_SERVICE_ACCOUNT_KEY) or as three separate fields — at least one
// full set must be present.
function hasFirebaseCredentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return true;
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

function validateEnv({ exitOnFailure = true } = {}) {
  const missing = ALWAYS_REQUIRED.filter((key) => !process.env[key]);

  if (!hasFirebaseCredentials()) {
    missing.push(
      'FIREBASE_SERVICE_ACCOUNT_KEY (or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)'
    );
  }

  if (missing.length > 0) {
    const message =
      `\n✖ Missing required environment variable(s): ${missing.join(', ')}\n` +
      `  Create a .env file (see .env.example) or set them in your deployment platform.\n`;

    console.error(message);

    if (exitOnFailure) {
      process.exit(1);
    } else {
      throw new Error(message);
    }
  }
}

module.exports = { validateEnv, hasFirebaseCredentials };
