require('dotenv').config();
const { validateEnv } = require('./config/env');

// Fail fast with a clear message if required env vars are missing,
// rather than letting the first request hit a confusing error.
validateEnv();

const { createApp } = require('./app');

const app = createApp();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n✦ Cold DM Generator running at http://localhost:${PORT}\n`);
});
