// Vercel Serverless Function: Verify OTP
import crypto from 'crypto';

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
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_OTP',
        message: 'Incorrect OTP. Please enter the valid 6-digit code or request a new one.',
      });
    }

    // Success! Generate proof token
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
