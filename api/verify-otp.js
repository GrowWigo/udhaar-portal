// Vercel Serverless Function: Verify OTP
import crypto from 'crypto';

// In-memory store for wrong OTP attempts (per IP + Mobile)
const wrongAttemptsMap = new Map();

function checkWrongAttemptsLimit(key, maxLimit = 3, windowMs = 60000) {
  const now = Date.now();
  const timestamps = wrongAttemptsMap.get(key) || [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxLimit) {
    const oldest = recent[0];
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    return {
      allowed: false,
      retryAfter,
      attempts: recent.length,
    };
  }

  return {
    allowed: true,
    remaining: maxLimit - recent.length,
  };
}

function recordWrongAttempt(key, windowMs = 60000) {
  const now = Date.now();
  const timestamps = wrongAttemptsMap.get(key) || [];
  const recent = timestamps.filter((t) => now - t < windowMs);
  recent.push(now);
  wrongAttemptsMap.set(key, recent);
  return Math.max(0, 3 - recent.length);
}

function clearWrongAttempts(key) {
  wrongAttemptsMap.delete(key);
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const rawMobile = (body.mobileNumber || '').toString().trim();
    const cleanMobile = rawMobile.replace(/\D/g, '').slice(-10);
    const enteredOtp = (body.otp || '').toString().trim();
    const token = (body.token || '').toString().trim();

    if (!cleanMobile || cleanMobile.length !== 10) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid 10-digit mobile number is required.',
      });
    }

    if (!enteredOtp || enteredOtp.length !== 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Please enter the complete 6-digit OTP received on your mobile.',
      });
    }

    if (!token || !token.includes('.')) {
      return res.status(400).json({
        status: 'error',
        message: 'Session expired or invalid. Please request a new OTP.',
      });
    }

    // Rate Limiting on Wrong Attempts: Max 3 wrong attempts per minute per person
    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      'unknown-ip';
    const attemptKey = `${clientIp}_${cleanMobile}`;

    const limitCheck = checkWrongAttemptsLimit(attemptKey, 3, 60000);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        status: 'error',
        code: 'TOO_MANY_WRONG_ATTEMPTS',
        message: `Security limit reached: Maximum 3 wrong OTP attempts allowed per minute. Please wait ${limitCheck.retryAfter} seconds before trying again.`,
        retryAfter: limitCheck.retryAfter,
      });
    }

    const [expiresAtStr, signature] = token.split('.');
    const expiresAt = parseInt(expiresAtStr, 10);

    // Check expiration
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return res.status(400).json({
        status: 'error',
        code: 'OTP_EXPIRED',
        message: 'This OTP has expired. Please request a new OTP.',
      });
    }

    const secret = process.env.OTP_SECRET || 'udhaar-portal-secure-otp-2026';

    // Verify HMAC signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${cleanMobile}:${enteredOtp}:${expiresAtStr}`)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );

    if (!isValid) {
      const remainingAttempts = recordWrongAttempt(attemptKey, 60000);
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_OTP',
        message: remainingAttempts > 0
          ? `Incorrect OTP. You have ${remainingAttempts} attempt(s) remaining in this minute.`
          : 'Security limit reached: You have entered incorrect OTP 3 times. Please wait 60 seconds.',
        remainingAttempts,
      });
    }

    // Success! Clear wrong attempts
    clearWrongAttempts(attemptKey);

    const verifiedAt = Date.now();
    const verificationProof = crypto
      .createHmac('sha256', secret)
      .update(`${cleanMobile}:VERIFIED:${verifiedAt}`)
      .digest('hex');

    return res.status(200).json({
      status: 'success',
      verified: true,
      message: 'Mobile number verified successfully!',
      mobileNumber: cleanMobile,
      verifiedToken: `${verifiedAt}.${verificationProof}`,
    });
  } catch (err) {
    console.error('Server error in verify-otp:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to verify OTP. Please try again.',
    });
  }
}
