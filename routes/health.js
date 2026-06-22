const express = require('express');
const history = require('../historyStore');
const { hasFirebaseCredentials } = require('../config/env');
const { GEMINI_MODEL } = require('../services/geminiService');

const router = express.Router();

router.get('/', async (req, res) => {
  let db = 'not configured';
  if (hasFirebaseCredentials()) {
    try {
      await history.ping();
      db = 'connected';
    } catch (err) {
      db = `error: ${err.message}`;
    }
  }
  res.json({ status: 'ok', model: GEMINI_MODEL, db });
});

module.exports = router;
