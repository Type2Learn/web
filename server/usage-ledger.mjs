import { randomUUID } from 'node:crypto';
import { apiError } from './errors.mjs';

const zeroUsage = () => ({
  committedUsd: 0,
  reservedUsd: 0,
  committedInputTokens: 0,
  reservedInputTokens: 0,
  committedOutputTokens: 0,
  reservedOutputTokens: 0,
  committedCredits: 0,
  reservedCredits: 0
});

const nonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const normalUsage = (value = {}) => Object.fromEntries(
  Object.keys(zeroUsage()).map((key) => [key, nonNegative(value[key])])
);

const sumUsage = (usage, prefix, requested) => nonNegative(usage['committed' + prefix]) + nonNegative(usage['reserved' + prefix]) + nonNegative(requested);
const committedUsage = (usage, prefix, requested) => nonNegative(usage['committed' + prefix]) + nonNegative(requested);
const reservationField = (prefix, requested) => nonNegative(requested);
const capExceeded = (amount, cap) => Number.isFinite(cap) && amount > cap + 0.0000001;
const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);

const recentTimes = (value, now) => (Array.isArray(value) ? value : [])
  .map((time) => Number(time))
  .filter((time) => Number.isFinite(time) && time > now - 60000 && time <= now);

const nextReservedUsage = (usage, requested) => ({
  ...usage,
  reservedUsd: usage.reservedUsd + reservationField('Usd', requested.usd),
  reservedInputTokens: usage.reservedInputTokens + reservationField('InputTokens', requested.inputTokens),
  reservedOutputTokens: usage.reservedOutputTokens + reservationField('OutputTokens', requested.outputTokens),
  reservedCredits: usage.reservedCredits + reservationField('Credits', requested.credits)
});

const settleUsage = (usage, reservation, actual) => ({
  ...usage,
  reservedUsd: Math.max(0, usage.reservedUsd - reservation.usd),
  reservedInputTokens: Math.max(0, usage.reservedInputTokens - reservation.inputTokens),
  reservedOutputTokens: Math.max(0, usage.reservedOutputTokens - reservation.outputTokens),
  reservedCredits: Math.max(0, usage.reservedCredits - reservation.credits),
  committedUsd: usage.committedUsd + actual.usd,
  committedInputTokens: usage.committedInputTokens + actual.inputTokens,
  committedOutputTokens: usage.committedOutputTokens + actual.outputTokens,
  committedCredits: usage.committedCredits + actual.credits
});

const releaseUsage = (usage, reservation) => ({
  ...usage,
  reservedUsd: Math.max(0, usage.reservedUsd - reservation.usd),
  reservedInputTokens: Math.max(0, usage.reservedInputTokens - reservation.inputTokens),
  reservedOutputTokens: Math.max(0, usage.reservedOutputTokens - reservation.outputTokens),
  reservedCredits: Math.max(0, usage.reservedCredits - reservation.credits)
});

const ensureCaps = (usage, requested, caps, level) => {
  if (capExceeded(sumUsage(usage, 'Usd', requested.usd), caps.usd)) {
    throw apiError(429, level === 'account' ? 'MONTHLY_APP_LIMIT_REACHED' : 'USER_MONTHLY_LIMIT_REACHED', 'The monthly AI allowance has been reached. The course support on this page is still available.');
  }
  if (capExceeded(sumUsage(usage, 'InputTokens', requested.inputTokens), caps.inputTokens)) {
    throw apiError(429, level === 'account' ? 'MONTHLY_APP_TOKEN_LIMIT_REACHED' : 'USER_MONTHLY_TOKEN_LIMIT_REACHED', 'The monthly AI allowance has been reached. The course support on this page is still available.');
  }
  if (capExceeded(sumUsage(usage, 'OutputTokens', requested.outputTokens), caps.outputTokens)) {
    throw apiError(429, level === 'account' ? 'MONTHLY_APP_TOKEN_LIMIT_REACHED' : 'USER_MONTHLY_TOKEN_LIMIT_REACHED', 'The monthly AI allowance has been reached. The course support on this page is still available.');
  }
  if (capExceeded(sumUsage(usage, 'Credits', requested.credits), caps.credits)) {
    throw apiError(429, level === 'account' ? 'SPEECH_MONTHLY_LIMIT_REACHED' : 'SPEECH_USER_LIMIT_REACHED', 'The monthly voice-input allowance has been reached. You can type instead.');
  }
};

const storedReservation = (kind, userHash, requested, now) => ({
  kind,
  userHash,
  usd: nonNegative(requested.usd),
  inputTokens: nonNegative(requested.inputTokens),
  outputTokens: nonNegative(requested.outputTokens),
  credits: nonNegative(requested.credits),
  createdAt: new Date(now),
  // A server interruption should not trap a learner's monthly allocation. The
  // next request reclaims an expired reservation before issuing a new one.
  expiresAt: new Date(now + 15 * 60 * 1000)
});

export const createUsageLedger = (firestore) => {
  const accountReference = (month) => firestore.collection('type2learnAiUsage').doc(month);

  const releaseExpiredReservations = async (month) => {
    const account = accountReference(month);
    const expired = await account.collection('reservations')
      .where('expiresAt', '<', new Date())
      .limit(25)
      .get();
    await Promise.all(expired.docs.map((document) => release({ month, reservationId: document.id, tolerateMissing: true })));
  };

  const reserve = async ({ kind, userHash, usage, caps, requestsPerMinute, now = Date.now() }) => {
    const month = monthKey(new Date(now));
    await releaseExpiredReservations(month);
    const account = accountReference(month);
    const user = account.collection('users').doc(userHash);
    const reservation = account.collection('reservations').doc(randomUUID());
    const requested = {
      usd: nonNegative(usage?.usd),
      inputTokens: nonNegative(usage?.inputTokens),
      outputTokens: nonNegative(usage?.outputTokens),
      credits: nonNegative(usage?.credits)
    };

    await firestore.runTransaction(async (transaction) => {
      const [accountSnapshot, userSnapshot] = await Promise.all([transaction.get(account), transaction.get(user)]);
      const accountData = accountSnapshot.data() || {};
      const userData = userSnapshot.data() || {};
      const accountUsage = normalUsage(accountData?.usage?.[kind]);
      const userUsage = normalUsage(userData?.usage?.[kind]);
      ensureCaps(accountUsage, requested, caps.account, 'account');
      ensureCaps(userUsage, requested, caps.user, 'user');

      const rateLimits = userData.rateLimits || {};
      const recent = recentTimes(rateLimits[kind], now);
      if (recent.length >= requestsPerMinute) {
        throw apiError(429, 'RATE_LIMITED', 'Please wait a moment before sending another request.');
      }
      recent.push(now);

      transaction.set(account, {
        usage: { ...(accountData.usage || {}), [kind]: nextReservedUsage(accountUsage, requested) },
        updatedAt: new Date(now)
      }, { merge: true });
      transaction.set(user, {
        usage: { ...(userData.usage || {}), [kind]: nextReservedUsage(userUsage, requested) },
        rateLimits: { ...rateLimits, [kind]: recent },
        updatedAt: new Date(now)
      }, { merge: true });
      transaction.create(reservation, storedReservation(kind, userHash, requested, now));
    });

    return { month, reservationId: reservation.id };
  };

  const complete = async ({ month, reservationId, actual, settle, tolerateMissing = false }) => {
    const account = accountReference(month);
    const reservation = account.collection('reservations').doc(reservationId);
    await firestore.runTransaction(async (transaction) => {
      const reservationSnapshot = await transaction.get(reservation);
      if (!reservationSnapshot.exists) {
        if (tolerateMissing) return;
        throw apiError(500, 'USAGE_LEDGER_ERROR', 'Usage protection could not continue.');
      }
      const held = reservationSnapshot.data() || {};
      const userHash = String(held.userHash || '');
      const kind = String(held.kind || '');
      if (!userHash || !kind) {
        transaction.delete(reservation);
        if (tolerateMissing) return;
        throw apiError(500, 'USAGE_LEDGER_ERROR', 'Usage protection could not continue.');
      }
      const user = account.collection('users').doc(userHash);
      const [accountSnapshot, userSnapshot] = await Promise.all([transaction.get(account), transaction.get(user)]);
      const accountData = accountSnapshot.data() || {};
      const userData = userSnapshot.data() || {};
      const reservationUsage = {
        usd: nonNegative(held.usd),
        inputTokens: nonNegative(held.inputTokens),
        outputTokens: nonNegative(held.outputTokens),
        credits: nonNegative(held.credits)
      };
      const actualUsage = {
        usd: nonNegative(actual?.usd),
        inputTokens: nonNegative(actual?.inputTokens),
        outputTokens: nonNegative(actual?.outputTokens),
        credits: nonNegative(actual?.credits)
      };
      const accountUsage = normalUsage(accountData?.usage?.[kind]);
      const userUsage = normalUsage(userData?.usage?.[kind]);
      const update = settle
        ? (usage) => settleUsage(usage, reservationUsage, actualUsage)
        : (usage) => releaseUsage(usage, reservationUsage);
      transaction.set(account, {
        usage: { ...(accountData.usage || {}), [kind]: update(accountUsage) },
        updatedAt: new Date()
      }, { merge: true });
      transaction.set(user, {
        usage: { ...(userData.usage || {}), [kind]: update(userUsage) },
        updatedAt: new Date()
      }, { merge: true });
      transaction.delete(reservation);
    });
  };

  const settle = (details) => complete({ ...details, settle: true });
  const release = (details) => complete({ ...details, settle: false });
  return { reserve, settle, release };
};

export const usageEstimate = (inputTokens = 0, outputTokens = 0, config) => (
  (nonNegative(inputTokens) / 1000000) * config.openAiInputUsdPerMillion
  + (nonNegative(outputTokens) / 1000000) * config.openAiOutputUsdPerMillion
);

export const openAiUsageCaps = (config) => ({
  account: {
    usd: config.openAiAppCapUsd,
    inputTokens: config.openAiAppInputTokenCap,
    outputTokens: config.openAiAppOutputTokenCap,
    credits: Infinity
  },
  user: {
    usd: config.openAiUserCapUsd,
    inputTokens: config.openAiUserInputTokenCap,
    outputTokens: config.openAiUserOutputTokenCap,
    credits: Infinity
  }
});

export const speechUsageCaps = (config) => ({
  account: { usd: Infinity, inputTokens: Infinity, outputTokens: Infinity, credits: config.speechmaticsMonthlyCreditCap },
  user: { usd: Infinity, inputTokens: Infinity, outputTokens: Infinity, credits: config.speechmaticsUserCreditCap }
});
