const { z } = require('zod');

// Keep limits generous but bounded — prevents abuse (huge payloads sent to
// Gemini) while not getting in the way of real usage.
const shortText = (max) => z.string().trim().max(max).optional().default('');
const requiredText = (max) => z.string().trim().min(1, 'required').max(max);

const generateSchema = z.object({
  platform: z.enum(['LinkedIn', 'Twitter / X', 'Instagram', 'Email', 'Discord']),
  tone: shortText(60),
  name: shortText(120),
  role: shortText(200),
  reason: requiredText(600),
  about: requiredText(600),
  cta: shortText(300),
  varCount: z.coerce.number().int().min(1).max(3).optional().default(1)
});

const followUpSchema = z
  .object({
    historyId: z.string().trim().min(1).max(100).optional(),
    baseVariantIndex: z.coerce.number().int().min(0).max(2).optional(),
    originalMessage: z.string().trim().max(2000).optional(),
    platform: shortText(60),
    tone: shortText(60),
    name: shortText(120),
    role: shortText(200),
    about: shortText(600),
    cta: shortText(300)
  })
  .refine((data) => Boolean(data.historyId) || Boolean(data.originalMessage), {
    message: 'Either historyId or originalMessage is required.'
  });

// ── Auth ──
const emailField = z.string().trim().toLowerCase().email('Must be a valid email address').max(255);

const signupSchema = z.object({
  email: emailField,
  password: z.string().min(8, 'Password must be at least 8 characters').max(200)
});

const loginSchema = z.object({
  email: emailField,
  // Intentionally lenient here (no min-length rule) — login should fail with a
  // generic "invalid email or password", not leak policy details about length.
  password: z.string().min(1, 'Password is required').max(200)
});

/**
 * Returns an Express middleware that validates req.body against the given
 * zod schema, replacing req.body with the parsed/defaulted result on success.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
      return res.status(400).json({ error: `Invalid request: ${message}` });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { generateSchema, followUpSchema, signupSchema, loginSchema, validateBody };
