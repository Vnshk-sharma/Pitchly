const fetch = require('node-fetch');

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_TIMEOUT_MS = 20000;

/**
 * Calls the Gemini API with a timeout guard, since fetch has no
 * built-in timeout and a hung request would otherwise pile up.
 */
async function callGemini(
  prompt,
  { maxOutputTokens = 1024, temperature = 0.85, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('Server is missing GEMINI_API_KEY. Check your .env file.');
    err.status = 500;
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let geminiRes;
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens, temperature }
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Gemini API request timed out. Please try again.');
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!geminiRes.ok) {
    const errData = await geminiRes.json().catch(() => ({}));
    const msg = errData?.error?.message || `Gemini API error ${geminiRes.status}`;
    const err = new Error(msg);
    err.status = geminiRes.status;
    throw err;
  }

  const data = await geminiRes.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!text) {
    const err = new Error('No response from Gemini. Please try again.');
    err.status = 500;
    throw err;
  }

  return text;
}

module.exports = { callGemini, GEMINI_MODEL };
