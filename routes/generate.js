const express = require('express');
const { callGemini } = require('../services/geminiService');
const history = require('../historyStore');
const { validateBody, generateSchema } = require('../middleware/validate');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

function buildPrompt({ platform, tone, name, role, reason, about, cta, count }) {
  return `You are an expert cold outreach copywriter known for messages that feel human, specific, and impossible to ignore. Your specialty is taking raw, unpolished notes from a client and rewriting them with resume-level precision — concrete nouns, named specifics, and credibility markers — never vague self-summaries.

Write ${count} cold DM${count > 1 ? 's' : ''} for ${platform}.

Raw context from the sender (treat this as unpolished notes, not finished copy):
- Recipient name: ${name || '(not specified)'}
- Recipient role / company: ${role || '(not specified)'}
- Why I am reaching out: ${reason}
- About me (sender): ${about}
- What I want (CTA): ${cta || '(not specified)'}
- Tone: ${tone}

Step 1 — Extract before you write:
From "About me" and "Why I am reaching out," pull out every concrete, checkable detail already present: numbers, metrics, dollar amounts, timeframes, named tools/platforms/technologies, company names, titles, specific projects, specific posts/content, or named outcomes. Treat these like resume bullet content — they are the proof, and the message is worthless without at least one of them in the opening or the credibility line.

Step 2 — Write using only real specifics:
1. Open with something genuinely specific about THEM — a real detail from "Why I am reaching out" (a specific post, project, launch, quote, number, or decision they made), not a generic compliment. Never start with "I came across your profile," "I hope this finds you well," or "I really admire what you're doing."
2. When you mention the sender, use the most concrete proof point available (a number, a named project, a specific result, a specific tool/stack, a timeframe) instead of a role description or trait ("growth marketer," "passionate," "experienced," "results-driven"). If "About me" truly contains no concrete detail, anchor on the single most specific noun phrase it does contain rather than summarizing it abstractly — and keep that line short rather than padding it with generic praise.
3. Never invent numbers, names, results, or facts that are not implied by the provided context. Specificity comes from using what's given precisely, not from fabricating detail.
4. Banned filler — do not use these or close synonyms: "passionate about," "proven track record," "results-driven," "extensive experience," "wide range of," "wealth of experience," "various," "numerous," "I noticed your profile," "your work speaks for itself," "I'd love to pick your brain."
5. Keep it short: under 120 words for social DMs, under 180 words for Email.
6. One clear, low-friction CTA at the end, tied to the specific reason given — not a generic "let's connect."
7. Sound like a real human, not a sales tool. No hollow flattery, no template phrases.
8. The first sentence must be about them, not you.
${count > 1
  ? `9. Each version must take a meaningfully different angle or opening hook, and each must surface a different specific detail (if more than one is available) rather than reusing the same proof point.

Return EXACTLY ${count} messages separated by this exact delimiter on its own line: ---VARIANT---
No preamble, no labels, no explanations. Just the messages and the delimiter.`
  : 'Return only the DM message. No preamble, no label, no explanation.'}`;
}

function parseVariants(text, count) {
  if (count <= 1) return [text.trim()];
  const parts = text.split('---VARIANT---').map((s) => s.trim()).filter(Boolean);
  return parts.length >= count ? parts.slice(0, count) : [...parts, ...Array(count - parts.length).fill('')];
}

router.post(
  '/',
  validateBody(generateSchema),
  asyncHandler(async (req, res) => {
    const { platform, tone, name, role, reason, about, cta, varCount } = req.body;
    const count = varCount;

    const prompt = buildPrompt({ platform, tone, name, role, reason, about, cta, count });
    const text = await callGemini(prompt, { maxOutputTokens: 1024, temperature: 0.85 });
    const variants = parseVariants(text, count);

    // Saving to history is non-fatal — a DB hiccup shouldn't break generation.
    let savedEntry = null;
    try {
      savedEntry = await history.addEntry(req.user.id, { platform, tone, name, role, reason, about, cta, variants });
    } catch (histErr) {
      console.error('Failed to save history entry:', histErr.message);
    }

    res.json({ variants, historyId: savedEntry?.id || null });
  })
);

module.exports = router;
