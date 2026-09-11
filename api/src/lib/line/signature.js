'use strict';

const crypto = require('crypto');

/**
 * Verify the X-Line-Signature header against the raw request body.
 *
 * A29. Three details decide whether this is real verification or theatre:
 *
 *   1. It runs over the RAW BYTES. LINE signs exactly what it sent; a body that has
 *      been parsed and re-serialised differs by whitespace and key order, so the
 *      signature never matches. The usual "fix" for that mismatch is to disable
 *      verification, which is how a webhook ends up accepting anything from anyone.
 *
 *   2. The comparison is constant time. A plain === returns as soon as two bytes
 *      differ, and that timing difference is enough to recover a valid signature one
 *      byte at a time.
 *
 *   3. Length is checked before timingSafeEqual, which throws on mismatched lengths.
 *      An exception thrown from inside the check is still a rejection here, but it
 *      would be reported as a server fault rather than a refused request.
 */
function verifyLineSignature({ rawBody, signature, channelSecret }) {
  if (!channelSecret) throw new Error('LINE_CHANNEL_SECRET is not configured');
  if (!signature || !rawBody) return false;

  const expected = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

/** Sign a payload the way LINE would. Used by the tests to build valid requests. */
function signPayload({ rawBody, channelSecret }) {
  return crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
}

module.exports = { verifyLineSignature, signPayload };
