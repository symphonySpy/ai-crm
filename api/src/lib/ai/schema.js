'use strict';

const { z } = require('zod');

// A23: the four outputs the brief asks for, in one call.
//
// The schema is the contract in both directions. It constrains what the model may
// return, and it is re-validated before anything is stored — a model that drifts, or a
// provider that changes its formatting, fails here rather than putting a malformed
// suggestion in front of a salesperson.
//
// A26 rests on this too. Customer text arrives from LINE and can say anything,
// including instructions aimed at the model. Validating the shape of what comes back
// means a successful injection still cannot produce a differently-shaped response.

const SCORE_CRITERIA = [
  'recency',
  'engagement',
  'budget_signal',
  'stage_progress',
  'deal_value',
];

const scoreReason = z.object({
  criterion: z.enum(SCORE_CRITERIA),
  // Each criterion is worth up to 20, so five of them make the 0-100 score.
  points: z.number().int().min(0).max(20),
  // The reason is what makes the number usable. A score a salesperson cannot
  // interrogate is a number they will either over-trust or ignore.
  note: z.string().min(1).max(200),
});

const copilotBundle = z.object({
  summary: z.string().min(1).max(800),
  score: z.number().int().min(0).max(100),
  // All five, always. A missing criterion would silently lower the total and leave no
  // trace of why.
  score_reasons: z.array(scoreReason).length(5),
  next_best_action: z.string().min(1).max(400),
  // Nullable on purpose: the model is told to return null when it cannot write a
  // responsible reply — for instance when the customer asked something only a human can
  // answer. A24 does the same on the fallback path.
  draft_line_reply: z.string().max(1000).nullable(),
});

/** Cross-field check the JSON schema cannot express: the parts must sum to the whole. */
function validateBundle(bundle) {
  const parsed = copilotBundle.parse(bundle);

  const total = parsed.score_reasons.reduce((sum, r) => sum + r.points, 0);
  if (total !== parsed.score) {
    throw new Error(
      `score ${parsed.score} does not equal the sum of its reasons (${total})`,
    );
  }

  const seen = new Set(parsed.score_reasons.map((r) => r.criterion));
  if (seen.size !== SCORE_CRITERIA.length) {
    throw new Error('score_reasons must cover each criterion exactly once');
  }

  return parsed;
}

module.exports = { copilotBundle, scoreReason, validateBundle, SCORE_CRITERIA };
