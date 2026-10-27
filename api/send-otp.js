// Vercel Serverless Function: Send OTP via PRP Bulk SMS API
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// In-memory rate limiter store for sliding window
// Global across invocations within the same lambda container
const rateLimitMap = new Map();

function checkRateLimit(key, maxLimit = 4, windowMs = 60000) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  
  // Keep only timestamps within the last windowMs (60 seconds)
  const recentTimestamps = timestamps.filter((t) => now - t < windowMs);
  
  if (recentTimestamps.length >= maxLimit) {
    const oldest = recentTimestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      count: recentTimestamps.length,
    };
  }
  
  recentTimestamps.push(now);
  rateLimitMap.set(key, recentTimestamps);
  
  // Periodic cleanup if map grows
  if (rateLimitMap.size > 5000) {
    for (const [k, v] of rateLimitMap.entries()) {
      const valid = v.filter((t) => now - t < windowMs);
      if (valid.length === 0) rateLimitMap.delete(k);
      else rateLimitMap.set(k, valid);
    }
  }
  
  return {
    allowed: true,
    remaining: maxLimit - recentTimestamps.length,
  };
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

    // Validate 10-digit Indian Mobile Number starting with 6-9
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
      });
    }

    // Client Identifier for Rate Limiting: IP + Mobile
    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      'unknown-ip';
    const rateLimitKey = `${clientIp}_${cleanMobile}`;

    // Rate Limit: Strictly maximum 5 OTP requests per 5 minutes
    const limitCheck = checkRateLimit(rateLimitKey, 5, 300000);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Security limit reached: Maximum 5 OTP requests allowed per 5 minutes. Please try again in ${limitCheck.retryAfterSeconds} seconds.`,
        retryAfter: limitCheck.retryAfterSeconds,
      });
    }

    // Generate 6-digit cryptographic OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
    const secret = process.env.OTP_SECRET || 'udhaar-portal-secure-otp-2026';

    // Sign the OTP stateless token
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${cleanMobile}:${otp}:${expiresAt}`)
      .digest('hex');
    const token = `${expiresAt}.${signature}`;

    const aisensyApiKey =
      process.env.AISENSY_API_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhMTUzOWYxYzQyOTNiMmM2ZmRhMDY5MSIsIm5hbWUiOiJVbmlmaW4gRXhwZXJ0cyBMTFAiLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNmExNTM5ZjFjNDI5M2IyYzZmZGEwNjhjIiwiYWN0aXZlUGxhbiI6IlBST19RVUFSVEVSTFkiLCJpYXQiOjE3OTMxMDEzNDh9.jHvk09-AH36o4lE5fA6IbjHytGTZtpmp6I2111OpBCU';
    const aisensyCampaignName = process.env.AISENSY_CAMPAIGN_NAME || 'otp verification api campaign';

    // PRP SMS Configuration (Fallback)
    const prpApiKey = process.env.PRP_API_KEY || 'kDaSc33XIFvl2b3';
    const prpSender = process.env.PRP_SENDER || 'UDHPAY';
    const prpTemplateName = process.env.PRP_TEMPLATE_NAME || 'reminder two';
    const prpTeId = process.env.PRP_TE_ID || '1707178152964344728';
    const prpPeId = process.env.PRP_PE_ID;
    const prpMessage = process.env.PRP_MESSAGE;

    let dispatchSuccess = false;
    let channel = 'WhatsApp';

    // 1. PRIMARY: AiSensy WhatsApp API
    if (aisensyApiKey && !aisensyApiKey.includes('YOUR_')) {
      try {
        const aisensyPayload = {
          apiKey: aisensyApiKey,
          campaignName: aisensyCampaignName,
          destination: `91${cleanMobile}`,
          userName: (body.name || 'Applicant').trim(),
          templateParams: [otp],
          source: 'new-landing-page form',
          media: {},
          buttons: [
            {
              type: 'button',
              sub_type: 'url',
              index: 0,
              parameters: [
                {
                  type: 'text',
                  text: otp,
                },
              ],
            },
          ],
          carouselCards: [],
          location: {},
          attributes: {},
          paramsFallbackValue: {
            FirstName: 'user',
          },
        };

        const aiRes = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(aisensyPayload),
        });

        const aiData = await aiRes.json();
        if (aiData && (aiData.success === 'true' || aiData.success === true)) {
          dispatchSuccess = true;
          channel = 'WhatsApp';
          console.log(`[AISENSY WHATSAPP SENT] OTP successfully dispatched to +91 ${cleanMobile}. MsgId: ${aiData.submitted_message_id}`);
        } else {
          console.warn('[AISENSY WHATSAPP ERROR] Failed to dispatch via AiSensy:', aiData);
        }
      } catch (aiErr) {
        console.error('Error invoking AiSensy API:', aiErr);
      }
    }

    // 2. FALLBACK: PRP Bulk SMS API (if AiSensy was not configured or failed)
    if (!dispatchSuccess && prpApiKey && prpApiKey !== 'YOUR_PRP_API_KEY' && !prpApiKey.includes('***')) {
      try {
        let apiUrl = 'https://api.bulksmsadmin.com/BulkSMSapi/keyApiSendSMS/SendSmsTemplateName';
        let params = otp;
        if (prpTemplateName && prpTemplateName.toLowerCase() === 'reminder two') {
          params = `${otp}~valid for 10 mins`;
        }

        const prpPayload = {
          sender: prpSender,
          templateName: prpTemplateName || 'reminder two',
          smsReciever: [
            {
              mobileNo: cleanMobile,
              templateParams: params,
            },
          ],
        };

        const prpRes = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            apikey: prpApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(prpPayload),
        });

        const gatewayResponse = await prpRes.json();
        if (gatewayResponse && (gatewayResponse.isSuccess === true || gatewayResponse.status === 'success')) {
          dispatchSuccess = true;
          channel = 'SMS';
          console.log(`[PRP SMS SENT] Live SMS successfully dispatched to +91 ${cleanMobile}. MsgId: ${gatewayResponse.data}`);
        } else {
          console.warn('PRP Gateway responded with error:', gatewayResponse);
        }
      } catch (gatewayErr) {
        console.error('Error invoking PRP Bulk SMS API:', gatewayErr);
      }
    }

    // 3. If delivery failed on both gateways, return clear error instead of fake OTP
    if (!dispatchSuccess) {
      console.error(`[OTP DISPATCH FAILED] Both AiSensy and PRP failed to deliver OTP to +91 ${cleanMobile}`);
      return res.status(502).json({
        status: 'error',
        message: 'Unable to deliver OTP via WhatsApp or SMS at the moment. Please verify your mobile number or try again.',
      });
    }

    return res.status(200).json({
      status: 'success',
      channel,
      message: channel === 'WhatsApp'
        ? `OTP has been sent on WhatsApp to +91 ${cleanMobile}.`
        : `OTP has been sent to +91 ${cleanMobile}.`,
      token,
      expiresAt,
    });

  } catch (err) {
    console.error('Server error in send-otp:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to process OTP request. Please try again.',
    });
  }
}
