'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const { copilotBundle } = require('./schema');
const { SYSTEM_PROMPT, renderUserTurn } = require('./prompt');
const { logger } = require('../logger');

// A28: one provider behind one interface. Swapping providers means implementing
// `generate(context)` and nothing else — the service, the fallback and the tests all sit
// on this seam rather than on a vendor SDK.

class AiUnavailableError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.name = 'AiUnavailableError';
    this.retryable = retryable;
  }
}

class LiveAiAdapter {
  constructor({ apiKey, model, timeoutMs }) {
    if (!apiKey) throw new Error('AI_API_KEY is not configured');
    this.model = model;
    // The SDK takes milliseconds. A copilot call that hangs holds a request open while a
    // salesperson watches a spinner; failing over to the rule-based path is better than
    // waiting, so the ceiling is deliberately low.
    this.client = new (Anthropic.default || Anthropic)({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async generate(context) {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: renderUserTurn(context) }],
        // Constrains the response shape at the API rather than hoping the prose parses.
        // The same schema is re-validated afterwards (schema.js) because a valid shape is
        // not the same as a valid answer — the score still has to equal its parts.
        output_config: { format: zodOutputFormat(copilotBundle, 'crm_copilot_bundle') },
      });

      // A safety decline is a real outcome, not an exception. Treating it as one keeps
      // the caller on the fallback path instead of showing a stack trace.
      if (response.stop_reason === 'refusal') {
        throw new AiUnavailableError(
          `model declined: ${(response.stop_details && response.stop_details.category) || 'unknown'}`,
        );
      }

      if (!response.parsed_output) {
        throw new AiUnavailableError('model returned no parseable output');
      }

      return { bundle: response.parsed_output, model: this.model };
    } catch (err) {
      if (err instanceof AiUnavailableError) throw err;

      // Typed classes, most specific first — a string match on the message would break
      // the moment the SDK rewords an error.
      const A = Anthropic.default || Anthropic;
      if (err instanceof A.AuthenticationError) {
        throw new AiUnavailableError('AI credentials rejected', { retryable: false });
      }
      if (err instanceof A.RateLimitError) {
        throw new AiUnavailableError('AI provider rate limited', { retryable: true });
      }
      if (err instanceof A.APIConnectionError) {
        throw new AiUnavailableError('AI provider unreachable', { retryable: true });
      }
      if (err instanceof A.APIError) {
        throw new AiUnavailableError(`AI provider error ${err.status}`, {
          retryable: err.status >= 500,
        });
      }
      throw new AiUnavailableError(`AI call failed: ${err.message}`, { retryable: false });
    }
  }
}

/**
 * Deterministic stand-in used by local development and the tests.
 *
 * It returns a well-formed bundle rather than a stub, so the tests exercise the real
 * validation and persistence path. `failNext()` makes the degraded path reachable
 * without waiting for a genuine outage — the fallback is the part most likely to rot
 * unnoticed, precisely because it only runs when something else is broken.
 */
class MockAiAdapter {
  constructor() {
    this.failuresRemaining = 0;
    this.invalidNext = 0;
    this.calls = [];
  }

  failNext(count = 1) {
    this.failuresRemaining = count;
  }

  /** Make the next call return a schema-valid body whose score contradicts its reasons. */
  returnInconsistentNext(count = 1) {
    this.invalidNext = count;
  }

  reset() {
    this.failuresRemaining = 0;
    this.invalidNext = 0;
    this.calls = [];
  }

  async generate(context) {
    this.calls.push(context);

    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new AiUnavailableError('Simulated AI outage', { retryable: true });
    }

    const reasons = [
      { criterion: 'recency', points: 14, note: 'ติดต่อล่าสุดภายในสัปดาห์' },
      { criterion: 'engagement', points: 12, note: 'ลูกค้าตอบกลับสม่ำเสมอ' },
      { criterion: 'budget_signal', points: 8, note: 'พูดถึงราคาแต่ยังไม่ระบุงบ' },
      { criterion: 'stage_progress', points: 13, note: `อยู่ที่ขั้น ${context.lead.stage}` },
      { criterion: 'deal_value', points: 10, note: 'มูลค่าปานกลาง' },
    ];
    const score = reasons.reduce((s, r) => s + r.points, 0);

    if (this.invalidNext > 0) {
      this.invalidNext -= 1;
      // Shape is fine; the arithmetic is not. Exactly the failure the cross-field check
      // in schema.js exists to catch.
      return {
        bundle: {
          summary: 'ผลลัพธ์จำลองที่คะแนนไม่ตรงกับเหตุผล',
          score: score + 25,
          score_reasons: reasons,
          next_best_action: 'ไม่ควรถูกบันทึก',
          draft_line_reply: 'ไม่ควรถูกส่ง',
        },
        model: 'mock',
      };
    }

    return {
      bundle: {
        summary: `สรุปจำลองสำหรับ lead "${context.lead.title}" ขั้น ${context.lead.stage}`,
        score,
        score_reasons: reasons,
        next_best_action: 'ส่งใบเสนอราคาพร้อมตัวเลือกแพ็กเกจ แล้วนัดคุยภายในสัปดาห์นี้',
        draft_line_reply:
          'สวัสดีครับ ขอบคุณที่สนใจ เดี๋ยวผมสรุปแพ็กเกจที่เหมาะกับทีมของคุณส่งให้นะครับ',
      },
      model: 'mock',
    };
  }
}

let instance = null;

/**
 * The adapter this process uses.
 *
 * Anything other than an explicit AI_ADAPTER=live gets the mock, and a live adapter with
 * no key falls back to the mock rather than throwing at startup — a missing key should
 * degrade the copilot, not stop the CRM from booting.
 */
function getAiAdapter() {
  if (instance) return instance;

  if (process.env.AI_ADAPTER === 'live' && process.env.AI_API_KEY) {
    instance = new LiveAiAdapter({
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'claude-opus-5',
      timeoutMs: Number(process.env.AI_TIMEOUT_MS || 15000),
    });
    logger.info({ model: instance.model }, 'AI adapter: live');
  } else {
    instance = new MockAiAdapter();
    logger.info(
      { reason: process.env.AI_ADAPTER === 'live' ? 'AI_API_KEY missing' : 'AI_ADAPTER not live' },
      'AI adapter: mock (no model calls leave this process)',
    );
  }

  return instance;
}

function resetAiAdapter() {
  instance = null;
}

module.exports = {
  getAiAdapter,
  resetAiAdapter,
  LiveAiAdapter,
  MockAiAdapter,
  AiUnavailableError,
};
