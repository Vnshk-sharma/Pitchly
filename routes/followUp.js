const express = require('express');
const { callGemini } = require('../services/geminiService');
const history = require('../historyStore');
const { validateBody, followUpSchema } = require('../middleware/validate');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

function buildPrompt(original, ctx) {
  return `You are an expert cold outreach copywriter. The message below was already sent and the recipient has not replied yet. Write ONE short, polite follow-up message that gently bumps the original without sounding pushy, needy, or passive-aggressive.

Original message that was sent:
"""
${original.trim()}
"""

Context:
- Platform: ${ctx.platform || '(not specified)'}
- Recipient name: ${ctx.name || '(not specified)'}
- Recipient role / company: ${ctx.role || '(not specified)'}
- About me (sender): ${ctx.about || '(not specified)'}
- What I want (CTA): ${ctx.cta || '(not specified)'}
- Tone: ${ctx.tone || 'Friendly & direct'}

Rules:
1. Do NOT repeat the original message verbatim or just restate it. Add a small new angle, detail, or reason to reply — and if "About me" contains a concrete detail (a number, named project, tool, or result) not yet used in the original, prefer that as the new angle over a generic line.
2. Keep it noticeably shorter than the original — a follow-up should feel low-effort to read and to answer.
3. Never say "just following up" or "bumping this" as the entire message — those phrases alone are lazy. If used, pair with something genuinely new and specific.
4. Avoid vague filler like "I wanted to circle back," "no pressure at all, just checking in," or "in case it got buried" as the sole content — pair any of these with a concrete reason or detail.
5. Never invent numbers, names, or results not implied by the context.
6. End with an easy yes/no or one-word-reply-friendly CTA.
7. Sound human, warm, and assume positive intent (they're busy, not ignoring you on purpose).
8. Return only the follow-up message. No preamble, no labels, no explanation.`;
}

router.post(
  '/',
  validateBody(followUpSchema),
  asyncHandler(async (req, res) => {
    const { historyId, baseVariantIndex, originalMessage, platform, tone, name, role, about, cta } = req.body;

    let original = originalMessage;
    let ctx = { platform, tone, name, role, about, cta };

    if (historyId) {
      const entry = await history.getById(historyId, req.user.id);
      if (!entry) {
        return res.status(404).json({ error: 'History entry not found.' });
      }
      const idx = typeof baseVariantIndex === 'number' ? baseVariantIndex : 0;
      original = entry.variants?.[idx] || entry.variants?.[0] || '';
      ctx = {
        platform: entry.platform,
        tone: entry.tone,
        name: entry.name,
        role: entry.role,
        about: entry.about,
        cta: entry.cta
      };
    }

    if (!original || !original.trim()) {
      return res.status(400).json({ error: 'Missing required field: originalMessage (or a valid historyId).' });
    }

    const prompt = buildPrompt(original, ctx);
    const text = await callGemini(prompt, { maxOutputTokens: 400, temperature: 0.85 });
    const followUpText = text.trim();

    let saved = null;
    if (historyId) {
      try {
        saved = await history.addFollowUp(historyId, req.user.id, {
          baseVariantIndex: typeof baseVariantIndex === 'number' ? baseVariantIndex : 0,
          text: followUpText
        });
      } catch (histErr) {
        console.error('Failed to save follow-up to history:', histErr.message);
      }
    }

    res.json({ followUp: followUpText, saved: !!saved });
  })
);

module.exports = router;
