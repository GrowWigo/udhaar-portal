/**
 * Udhaar Portal - Client Application Script
 * Plain Vanilla JavaScript - No external dependencies
 */

(function () {
  'use strict';

  /* ==========================================================================
     1. TRACKING & ATTRIBUTION (First-party cookie, 90-day retention)
     ========================================================================== */
  const TRACKING_COOKIE_NAME = 'udhaar_attribution';
  const COOKIE_EXPIRY_DAYS = 90;

  function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = 'expires=' + d.toUTCString();
    document.cookie =
      name +
      '=' +
      encodeURIComponent(JSON.stringify(value)) +
      ';' +
      expires +
      ';path=/;SameSite=Lax';
  }

  function getCookie(name) {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i].trim();
      if (c.indexOf(nameEQ) === 0) {
        try {
          return JSON.parse(decodeURIComponent(c.substring(nameEQ.length)));
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  function initAttributionTracking() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const trackingKeys = [
        'gclid',
        'gbraid',
        'wbraid',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content'
      ];

      const currentParams = {};
      let hasNewParams = false;

      trackingKeys.forEach(function (key) {
        if (urlParams.has(key)) {
          currentParams[key] = urlParams.get(key);
          hasNewParams = true;
        }
      });

      const existingData = getCookie(TRACKING_COOKIE_NAME) || {};
      const mergedTracking = Object.assign({}, existingData, currentParams, {
        last_updated: new Date().toISOString()
      });

      if (hasNewParams || !existingData.last_updated) {
        setCookie(TRACKING_COOKIE_NAME, mergedTracking, COOKIE_EXPIRY_DAYS);
      }

      return mergedTracking;
    } catch (err) {
      return {};
    }
  }

  const attributionData = initAttributionTracking();

  /* ==========================================================================
     2. FORM VALIDATION & SANITIZATION HELPERS
     ========================================================================== */
  function sanitizeName(value) {
    return value.replace(/[^a-zA-Z\s]/g, '').replace(/\s{2,}/g, ' ');
  }

  function validateName(value) {
    const trimmed = (value || '').trim();
    if (trimmed.length < 2 || trimmed.length > 40) return false;
    return /^[A-Za-z]+( [A-Za-z]+)*$/.test(trimmed);
  }

  function sanitizeMobile(value) {
    return (value || '').replace(/\D/g, '').slice(0, 10);
  }

  function validateMobile(value) {
    return /^[6-9]\d{9}$/.test(value || '');
  }

  function validateEmail(value) {
    const trimmed = (value || '').trim().toLowerCase();
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed);
  }

  function sanitizeSalary(value) {
    return (value || '').replace(/\D/g, '').slice(0, 9);
  }

  function sanitizePAN(value) {
    return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  }

  function validatePAN(value) {
    return /^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$/.test(value || '');
  }

  function setFieldState(groupId, isValid, message) {
    const group = document.getElementById(groupId);
    if (!group) return;

    const errorEl = group.querySelector('.error-message');
    const inputEl = group.querySelector('input, select');

    if (isValid) {
      group.classList.remove('has-error');
      group.classList.remove('shake-error');
      group.classList.add('is-valid');
      if (inputEl) inputEl.setAttribute('aria-invalid', 'false');
      if (errorEl) errorEl.textContent = '';
    } else {
      group.classList.remove('is-valid');
      group.classList.add('has-error');
      if (groupId === 'group-consent') {
        group.classList.remove('shake-error');
        void group.offsetWidth; // Force CSS reflow to re-trigger animation
        group.classList.add('shake-error');
      }
      if (inputEl) inputEl.setAttribute('aria-invalid', 'true');
      if (errorEl && message) errorEl.textContent = message;
    }
  }

  /* ==========================================================================
     3. SUBMISSION HANDLER & SUPABASE INTEGRATION
     ========================================================================== */
  async function submitLead(payload) {
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
      submitBtn.classList.add('is-loading');
      submitBtn.setAttribute('disabled', 'disabled');
      submitBtn.setAttribute('aria-busy', 'true');
    }

    try {
      const leadId = window.UdhaarSupabase
        ? window.UdhaarSupabase.generateLeadId()
        : 'UP-' + Date.now().toString(36).toUpperCase();

      const tracking = payload.tracking || {};

      const rawSalaryDigits = (payload.monthlySalary || '').toString().replace(/\D/g, '');
      const salaryAmount = payload.salaryAmount || (rawSalaryDigits ? parseInt(rawSalaryDigits, 10) : 0);
      const readableSalary = payload.monthlySalary || (salaryAmount ? '₹' + salaryAmount.toLocaleString('en-IN') : '');

      const leadRecord = {
        lead_id: leadId,
        created_at: new Date().toISOString(),
        first_name: payload.firstName || '',
        last_name: payload.lastName || '',
        full_name: `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
        mobile_number: payload.mobileNumber || '',
        email: payload.email || '',
        monthly_salary: readableSalary,
        employment_type: payload.employmentType || '',
        pan_number: payload.panNumber || '',
        city: payload.city || '',
        form_details: {
          firstName: payload.firstName,
          lastName: payload.lastName,
          mobileNumber: payload.mobileNumber,
          email: payload.email,
          monthlySalary: readableSalary,
          salaryAmount: salaryAmount,
          employmentType: payload.employmentType || '',
          panNumber: payload.panNumber,
          city: payload.city,
          submittedAt: payload.submittedAt
        },
        lead_source: tracking.utm_source ? 'Campaign' : 'Website - Loan Application',
        utm_source: tracking.utm_source || '',
        utm_medium: tracking.utm_medium || '',
        utm_campaign: tracking.utm_campaign || '',
        utm_term: tracking.utm_term || '',
        utm_content: tracking.utm_content || '',
        gclid: tracking.gclid || '',
        documents: [],
        lead_status: 'New Lead',
        status: 'New Lead',
        document_status: 'Pending',
        is_mobile_verified: true,
        otp_verified: true,
        verified_at: new Date().toISOString()
      };

      // Persist in Supabase
      if (window.UdhaarSupabase && typeof window.UdhaarSupabase.saveLead === 'function') {
        const supabaseResult = await window.UdhaarSupabase.saveLead(leadRecord);
        console.info('Supabase Lead Saved:', supabaseResult);
      }

      // Store in storage for document upload correlation
      try {
        sessionStorage.setItem('udhaar_active_lead_id', leadId);
        localStorage.setItem('udhaar_active_lead_id', leadId);
        sessionStorage.setItem('udhaar_lead_data', JSON.stringify(leadRecord));
      } catch (storageErr) {
        console.warn('Storage unavailable', storageErr);
      }

      // Qualification rules:
      // Salary < ₹35,000 -> thank-you-standard.html
      // Salary >= ₹35,000 -> thank-you-qualified.html
      const isQualified = !isNaN(salaryAmount) && salaryAmount >= 35000;
      const targetPage = isQualified ? 'thank-you-qualified.html' : 'thank-you-standard.html';

      // Redirect with lead_id parameter
      window.location.href = `${targetPage}?lead_id=${encodeURIComponent(leadId)}`;
    } catch (err) {
      console.error('Submission error:', err);
      if (submitBtn) {
        submitBtn.classList.remove('is-loading');
        submitBtn.removeAttribute('disabled');
        submitBtn.removeAttribute('aria-busy');
      }
      alert('An unexpected error occurred. Please try submitting again.');
    }
  }

  /* ==========================================================================
     4. FORM INITIALIZATION & LIVE BINDINGS
     ========================================================================== */
  function initLeadForm() {
    const form = document.getElementById('leadForm');
    if (!form) return;

    // Step containers & pills
    const step1Container = document.getElementById('step1Container');
    const step2Container = document.getElementById('step2Container');
    const stepPill1 = document.getElementById('stepPill1');
    const stepPill2 = document.getElementById('stepPill2');

    // Step 1: Mobile & OTP verification elements
    const mobileInput = document.getElementById('mobile');
    const btnSendOtp = document.getElementById('btnSendOtp');
    const otpVerificationBox = document.getElementById('otpVerificationBox');
    const otpSentPhone = document.getElementById('otpSentPhone');
    const btnEditMobile = document.getElementById('btnEditMobile');
    const otpCodeInput = document.getElementById('otpCode');
    const otpErrorMessage = document.getElementById('otpErrorMessage');
    const otpStatusMessage = document.getElementById('otpStatusMessage');
    const btnVerifyOtp = document.getElementById('btnVerifyOtp');
    const resendTimerText = document.getElementById('resendTimerText');
    const resendCountdown = document.getElementById('resendCountdown');
    const btnResendOtp = document.getElementById('btnResendOtp');

    // Step 2 elements
    const displayVerifiedPhone = document.getElementById('displayVerifiedPhone');
    const btnChangeVerifiedPhone = document.getElementById('btnChangeVerifiedPhone');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const emailInput = document.getElementById('email');
    const salaryInput = document.getElementById('monthlySalary');
    const employmentSelect = document.getElementById('employmentType');
    const panInput = document.getElementById('panNumber');
    const citySelect = document.getElementById('city');
    const consentCheck = document.getElementById('consentCheckbox');

    // OTP State Variables
    let isMobileOtpVerified = false;
    let verifiedMobile = '';
    let currentOtpToken = '';
    let resendTimer = null;
    let rateLimitCooldownTimer = null;

    // ==========================================
    // RATE LIMITING (Anti-hacker protection: Max 4 requests/min)
    // ==========================================
    const OTP_RATE_STORAGE_KEY = 'udhaar_otp_req_timestamps';
    const OTP_MAX_REQUESTS_PER_MIN = 4;
    const OTP_WINDOW_MS = 60000;

    function getOtpTimestamps() {
      try {
        const raw = sessionStorage.getItem(OTP_RATE_STORAGE_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        const now = Date.now();
        return arr.filter((t) => now - t < OTP_WINDOW_MS);
      } catch (e) {
        return [];
      }
    }

    function recordOtpTimestamp() {
      const timestamps = getOtpTimestamps();
      timestamps.push(Date.now());
      try {
        sessionStorage.setItem(OTP_RATE_STORAGE_KEY, JSON.stringify(timestamps));
      } catch (e) {}
    }

    function checkClientRateLimit() {
      const timestamps = getOtpTimestamps();
      if (timestamps.length >= OTP_MAX_REQUESTS_PER_MIN) {
        const oldest = timestamps[0];
        const waitMs = OTP_WINDOW_MS - (Date.now() - oldest);
        const waitSeconds = Math.max(1, Math.ceil(waitMs / 1000));
        return { allowed: false, waitSeconds };
      }
      return { allowed: true, remaining: OTP_MAX_REQUESTS_PER_MIN - timestamps.length };
    }

    function showOtpStatus(msg, type = 'error') {
      if (!otpStatusMessage) return;
      otpStatusMessage.className = `otp-status-message ${type}`;
      otpStatusMessage.innerHTML = msg;
      otpStatusMessage.style.display = 'block';
    }

    function clearOtpStatus() {
      if (!otpStatusMessage) return;
      otpStatusMessage.innerHTML = '';
      otpStatusMessage.style.display = 'none';
    }

    function triggerRateLimitLock(waitSeconds) {
      if (btnSendOtp) btnSendOtp.setAttribute('disabled', 'disabled');
      if (btnResendOtp) btnResendOtp.setAttribute('disabled', 'disabled');

      showOtpStatus(
        `⚠️ <strong>Security Limit:</strong> Hacker attack protection ke liye 1 minute mein maximum 4 OTP requests allowed hain. Kripya <strong id="rlSec">${waitSeconds}</strong>s wait karein.`,
        'warning'
      );

      if (rateLimitCooldownTimer) clearInterval(rateLimitCooldownTimer);
      let remaining = waitSeconds;
      rateLimitCooldownTimer = setInterval(function () {
        remaining--;
        const secSpan = document.getElementById('rlSec');
        if (secSpan) secSpan.textContent = remaining;
        if (remaining <= 0) {
          clearInterval(rateLimitCooldownTimer);
          rateLimitCooldownTimer = null;
          clearOtpStatus();
          if (btnSendOtp) btnSendOtp.removeAttribute('disabled');
          if (btnResendOtp) btnResendOtp.removeAttribute('disabled');
        }
      }, 1000);
    }

    function startResendCooldown(seconds = 30) {
      if (resendTimer) clearInterval(resendTimer);
      if (btnResendOtp) btnResendOtp.style.display = 'none';
      if (resendTimerText) resendTimerText.style.display = 'inline';
      let count = seconds;
      if (resendCountdown) resendCountdown.textContent = count;

      resendTimer = setInterval(function () {
        count--;
        if (resendCountdown) resendCountdown.textContent = count;
        if (count <= 0) {
          clearInterval(resendTimer);
          resendTimer = null;
          const limit = checkClientRateLimit();
          if (limit.allowed) {
            if (resendTimerText) resendTimerText.style.display = 'none';
            if (btnResendOtp) {
              btnResendOtp.style.display = 'inline';
              btnResendOtp.removeAttribute('disabled');
            }
          } else {
            if (resendTimerText) {
              resendTimerText.style.display = 'inline';
              resendTimerText.innerHTML = `⚠️ Limit: Wait <strong>${limit.waitSeconds}</strong>s to resend`;
            }
          }
        }
      }, 1000);
    }

    // ==========================================
    // SEND OTP HANDLER
    // ==========================================
    async function handleSendOtp() {
      clearOtpStatus();
      if (otpErrorMessage) otpErrorMessage.textContent = '';

      const rawMobile = mobileInput ? mobileInput.value.trim() : '';
      const clean = sanitizeMobile(rawMobile);

      if (!clean || clean.length !== 10 || !validateMobile(clean)) {
        setFieldState('group-mobile', false, 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.');
        if (mobileInput) mobileInput.focus();
        return;
      }

      setFieldState('group-mobile', true);

      // Check client rate limit (max 4 requests per min)
      const limit = checkClientRateLimit();
      if (!limit.allowed) {
        triggerRateLimitLock(limit.waitSeconds);
        return;
      }

      const activeBtn = (btnSendOtp && btnSendOtp.style.display !== 'none') ? btnSendOtp : btnResendOtp;
      if (activeBtn) {
        activeBtn.classList.add('is-loading');
        activeBtn.setAttribute('disabled', 'disabled');
      }

      try {
        const resp = await fetch('/api/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobileNumber: clean }),
        });

        const data = await resp.json();

        if (activeBtn) {
          activeBtn.classList.remove('is-loading');
          activeBtn.removeAttribute('disabled');
        }

        if (resp.status === 429) {
          triggerRateLimitLock(data.retryAfter || 60);
          return;
        }

        if (!resp.ok || data.status !== 'success') {
          showOtpStatus(data.message || 'OTP send karne mein issue aaya. Please dubara try karein.', 'error');
          return;
        }

        // Record timestamp for rate limit tracking
        recordOtpTimestamp();
        currentOtpToken = data.token;

        // Show OTP box
        if (btnSendOtp) btnSendOtp.style.display = 'none';
        if (otpVerificationBox) otpVerificationBox.style.display = 'block';
        if (otpSentPhone) otpSentPhone.textContent = `+91 ${clean}`;

        let successMsg = `OTP sent to +91 ${clean}.`;
        if (data.demoMode && data.previewOtp) {
          successMsg += ` <br><strong style="color: #047857;">[Test OTP: ${data.previewOtp}]</strong>`;
        }
        showOtpStatus(successMsg, 'success');

        startResendCooldown(30);

        if (otpCodeInput) {
          otpCodeInput.value = '';
          otpCodeInput.focus();
        }
      } catch (err) {
        console.error('Send OTP network error:', err);
        if (activeBtn) {
          activeBtn.classList.remove('is-loading');
          activeBtn.removeAttribute('disabled');
        }
        showOtpStatus('Network error. Kripya apna internet connection check karein.', 'error');
      }
    }

    // ==========================================
    // VERIFY OTP HANDLER
    // ==========================================
    async function handleVerifyOtp() {
      clearOtpStatus();
      if (otpErrorMessage) otpErrorMessage.textContent = '';

      const rawMobile = mobileInput ? mobileInput.value.trim() : '';
      const clean = sanitizeMobile(rawMobile);
      const code = otpCodeInput ? otpCodeInput.value.trim().replace(/\D/g, '') : '';

      if (!code || code.length !== 6) {
        if (otpErrorMessage) otpErrorMessage.textContent = 'Please enter the complete 6-digit OTP code.';
        if (otpCodeInput) otpCodeInput.focus();
        return;
      }

      if (btnVerifyOtp) {
        btnVerifyOtp.classList.add('is-loading');
        btnVerifyOtp.setAttribute('disabled', 'disabled');
      }

      try {
        const resp = await fetch('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mobileNumber: clean,
            otp: code,
            token: currentOtpToken,
          }),
        });

        const data = await resp.json();

        if (btnVerifyOtp) {
          btnVerifyOtp.classList.remove('is-loading');
          btnVerifyOtp.removeAttribute('disabled');
        }

        if (!resp.ok || !data.verified) {
          showOtpStatus(data.message || 'Galat OTP code hai. Kripya sahi code enter karein.', 'error');
          if (otpCodeInput) otpCodeInput.focus();
          return;
        }

        // Verified successfully!
        isMobileOtpVerified = true;
        verifiedMobile = clean;

        showOtpStatus('✓ Mobile number verified successfully! Application form unlock ho raha hai...', 'success');

        setTimeout(function () {
          // Update pills
          if (stepPill1) {
            stepPill1.classList.remove('active');
            stepPill1.classList.add('completed');
            stepPill1.innerHTML = '<span class="step-badge">✓</span><span class="step-title">Mobile Verified</span>';
          }
          if (stepPill2) {
            stepPill2.classList.add('active');
          }

          // Switch containers
          if (step1Container) step1Container.style.display = 'none';
          if (step2Container) step2Container.style.display = 'block';

          if (displayVerifiedPhone) {
            displayVerifiedPhone.textContent = `+91 ${clean}`;
          }

          // Focus on first name input
          if (firstNameInput) firstNameInput.focus();

          // Scroll to card
          const card = document.getElementById('lead-form-card');
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 500);
      } catch (err) {
        console.error('Verify OTP network error:', err);
        if (btnVerifyOtp) {
          btnVerifyOtp.classList.remove('is-loading');
          btnVerifyOtp.removeAttribute('disabled');
        }
        showOtpStatus('Verification failed. Kripya dobara try karein.', 'error');
      }
    }

    // ==========================================
    // RESET / CHANGE MOBILE
    // ==========================================
    function resetMobileVerification() {
      isMobileOtpVerified = false;
      verifiedMobile = '';
      currentOtpToken = '';

      if (stepPill1) {
        stepPill1.classList.remove('completed');
        stepPill1.classList.add('active');
        stepPill1.innerHTML = '<span class="step-badge">1</span><span class="step-title">Verify Mobile</span>';
      }
      if (stepPill2) {
        stepPill2.classList.remove('active');
      }

      if (step2Container) step2Container.style.display = 'none';
      if (step1Container) step1Container.style.display = 'block';

      if (otpVerificationBox) otpVerificationBox.style.display = 'none';
      if (btnSendOtp) btnSendOtp.style.display = 'block';
      if (otpCodeInput) otpCodeInput.value = '';
      clearOtpStatus();

      if (mobileInput) {
        mobileInput.removeAttribute('disabled');
        mobileInput.focus();
      }
    }

    // Attach OTP Event Listeners
    if (btnSendOtp) {
      btnSendOtp.addEventListener('click', handleSendOtp);
    }

    if (btnResendOtp) {
      btnResendOtp.addEventListener('click', handleSendOtp);
    }

    if (btnVerifyOtp) {
      btnVerifyOtp.addEventListener('click', handleVerifyOtp);
    }

    if (btnEditMobile) {
      btnEditMobile.addEventListener('click', resetMobileVerification);
    }

    if (btnChangeVerifiedPhone) {
      btnChangeVerifiedPhone.addEventListener('click', resetMobileVerification);
    }

    if (otpCodeInput) {
      otpCodeInput.addEventListener('input', function (e) {
        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
        if (e.target.value !== val) e.target.value = val;
        if (val.length === 6) {
          handleVerifyOtp();
        }
      });
      otpCodeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleVerifyOtp();
        }
      });
    }

    // Step 1: Mobile input listeners
    if (mobileInput) {
      mobileInput.addEventListener('input', function (e) {
        const cleaned = sanitizeMobile(e.target.value);
        if (e.target.value !== cleaned) e.target.value = cleaned;
        if (cleaned.length === 10) {
          if (validateMobile(cleaned)) {
            setFieldState('group-mobile', true);
          } else {
            setFieldState('group-mobile', false, 'Mobile number must start with 6, 7, 8, or 9.');
          }
        }
      });
      mobileInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSendOtp();
        }
      });
      mobileInput.addEventListener('blur', function () {
        const val = mobileInput.value.trim();
        if (!val) {
          setFieldState('group-mobile', false, 'Please enter your 10-digit mobile number.');
        } else if (!validateMobile(val)) {
          setFieldState('group-mobile', false, 'Enter a valid 10-digit mobile number starting with 6-9.');
        } else {
          setFieldState('group-mobile', true);
        }
      });
    }

    // Step 2: Form Fields live validations
    if (firstNameInput) {
      firstNameInput.addEventListener('input', function (e) {
        const cleaned = sanitizeName(e.target.value);
        if (e.target.value !== cleaned) e.target.value = cleaned;
        if (cleaned.length >= 2) setFieldState('group-first-name', true);
      });
      firstNameInput.addEventListener('blur', function () {
        const val = firstNameInput.value.trim();
        if (!val) {
          setFieldState('group-first-name', false, 'Please enter your first name.');
        } else if (!validateName(val)) {
          setFieldState('group-first-name', false, 'Letters only (2-40 characters).');
        } else {
          setFieldState('group-first-name', true);
        }
      });
    }

    if (lastNameInput) {
      lastNameInput.addEventListener('input', function (e) {
        const cleaned = sanitizeName(e.target.value);
        if (e.target.value !== cleaned) e.target.value = cleaned;
        if (cleaned.length >= 2) setFieldState('group-last-name', true);
      });
      lastNameInput.addEventListener('blur', function () {
        const val = lastNameInput.value.trim();
        if (!val) {
          setFieldState('group-last-name', false, 'Please enter your last name.');
        } else if (!validateName(val)) {
          setFieldState('group-last-name', false, 'Letters only (2-40 characters).');
        } else {
          setFieldState('group-last-name', true);
        }
      });
    }

    if (emailInput) {
      emailInput.addEventListener('input', function (e) {
        const lower = e.target.value.toLowerCase().trim();
        if (e.target.value !== lower) e.target.value = lower;
        if (validateEmail(lower)) setFieldState('group-email', true);
      });
      emailInput.addEventListener('blur', function () {
        const val = emailInput.value.trim();
        if (!val) {
          setFieldState('group-email', false, 'Please enter your email address.');
        } else if (!validateEmail(val)) {
          setFieldState('group-email', false, 'Please enter a valid email format.');
        } else {
          setFieldState('group-email', true);
        }
      });
    }

    if (salaryInput) {
      salaryInput.addEventListener('input', function (e) {
        const raw = sanitizeSalary(e.target.value);
        if (raw) {
          const num = parseInt(raw, 10);
          e.target.value = num.toLocaleString('en-IN');
          if (num >= 5000) {
            setFieldState('group-salary', true);
          }
        } else {
          e.target.value = '';
        }
      });
      salaryInput.addEventListener('blur', function () {
        const raw = sanitizeSalary(salaryInput.value);
        const num = parseInt(raw, 10);
        if (!raw || isNaN(num) || num <= 0) {
          setFieldState('group-salary', false, 'Please enter your monthly salary.');
        } else if (num < 5000) {
          setFieldState('group-salary', false, 'Minimum monthly salary is ₹5,000.');
        } else {
          setFieldState('group-salary', true);
        }
      });
    }

    if (employmentSelect) {
      employmentSelect.addEventListener('change', function () {
        if (employmentSelect.value !== '') setFieldState('group-employment', true);
        else setFieldState('group-employment', false, 'Please select your employment type.');
      });
    }

    if (panInput) {
      panInput.addEventListener('input', function (e) {
        const cleaned = sanitizePAN(e.target.value);
        if (e.target.value !== cleaned) e.target.value = cleaned;
        if (cleaned.length === 10) {
          if (validatePAN(cleaned)) {
            setFieldState('group-pan', true);
          } else {
            setFieldState('group-pan', false, 'Invalid PAN format. Must be 5 letters (4th is P), 4 digits, 1 letter.');
          }
        }
      });
      panInput.addEventListener('blur', function () {
        const val = panInput.value.trim().toUpperCase();
        if (!val) {
          setFieldState('group-pan', false, 'Please enter your 10-character PAN number.');
        } else if (!validatePAN(val)) {
          setFieldState('group-pan', false, 'Format error: 3 letters, P, 1 letter, 4 digits, 1 letter (e.g. ABCPK1234A).');
        } else {
          setFieldState('group-pan', true);
        }
      });
    }

    if (citySelect) {
      citySelect.addEventListener('change', function () {
        if (citySelect.value !== '') setFieldState('group-city', true);
        else setFieldState('group-city', false, 'Please select your current city.');
      });
    }

    if (consentCheck) {
      consentCheck.addEventListener('change', function () {
        if (consentCheck.checked) {
          setFieldState('group-consent', true);
        } else {
          setFieldState('group-consent', false, 'Please tick this checkbox to agree to the terms and privacy policy.');
        }
      });
    }

    // Step 2: Form submit
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Guard: OTP must be verified
      if (!isMobileOtpVerified || !verifiedMobile) {
        resetMobileVerification();
        showOtpStatus('Form submit karne se pehle Mobile Number OTP verify karna zaroori hai.', 'error');
        return;
      }

      let hasErrors = false;
      let firstErrorEl = null;

      const firstNameVal = firstNameInput ? firstNameInput.value.trim() : '';
      if (!validateName(firstNameVal)) {
        setFieldState('group-first-name', false, 'Please enter a valid first name.');
        hasErrors = true;
        if (!firstErrorEl) firstErrorEl = firstNameInput;
      } else {
        setFieldState('group-first-name', true);
      }

      const lastNameVal = lastNameInput ? lastNameInput.value.trim() : '';
      if (!validateName(lastNameVal)) {
        setFieldState('group-last-name', false, 'Please enter a valid last name.');
        hasErrors = true;
        if (!firstErrorEl) firstErrorEl = lastNameInput;
      } else {
        setFieldState('group-last-name', true);
      }

      const emailVal = emailInput ? emailInput.value.trim().toLowerCase() : '';
      if (!validateEmail(emailVal)) {
        setFieldState('group-email', false, 'Please enter a valid email address.');
        hasErrors = true;
        if (!firstErrorEl) firstErrorEl = emailInput;
      } else {
        setFieldState('group-email', true);
      }

      const rawSalary = salaryInput ? sanitizeSalary(salaryInput.value) : '';
      const salaryNum = parseInt(rawSalary, 10);
      if (!rawSalary || isNaN(salaryNum) || salaryNum <= 0) {
        setFieldState('group-salary', false, 'Please enter your monthly salary.');
        hasErrors = true;
        if (!firstErrorEl) firstErrorEl = salaryInput;
      } else if (salaryNum < 5000) {
        setFieldState('group-salary', false, 'Minimum monthly salary is ₹5,000.');
        hasErrors = true;
        if (!firstErrorEl) firstErrorEl = salaryInput;
      } else {
        setFieldState('group-salary', true);
      }

      const employmentVal = employmentSelect ? employmentSelect.value : '';
      if (employmentVal === '') {
        setFieldState('group-employment', false, 'Please select your employment type.');
        hasErrors = true;
        if (!firstErrorEl) firstErrorEl = employmentSelect;
      } else {
        setFieldState('group-employment', true);
      }

      const panVal = panInput ? panInput.value.trim().toUpperCase() : '';
      if (!validatePAN(panVal)) {
        setFieldState('group-pan', false, 'Please provide a valid 10-character PAN (e.g., ABCPK1234A).');
        hasErrors = true;
        if (!firstErrorEl) firstErrorEl = panInput;
      } else {
        setFieldState('group-pan', true);
      }

      const cityVal = citySelect ? citySelect.value : '';
      if (cityVal === '') {
        setFieldState('group-city', false, 'Please select your current city.');
        hasErrors = true;
        if (!firstErrorEl) firstErrorEl = citySelect;
      } else {
        setFieldState('group-city', true);
      }

      if (!consentCheck || !consentCheck.checked) {
        setFieldState('group-consent', false, 'Please tick this checkbox to agree to the terms and privacy policy.');
        hasErrors = true;
        if (!firstErrorEl) firstErrorEl = consentCheck;
      } else {
        setFieldState('group-consent', true);
      }

      if (hasErrors) {
        if (firstErrorEl) {
          if (typeof firstErrorEl.scrollIntoView === 'function') {
            firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          if (typeof firstErrorEl.focus === 'function') {
            firstErrorEl.focus();
          }
        }
        return;
      }

      const formattedSalary = salaryNum ? '₹' + salaryNum.toLocaleString('en-IN') : '';
      const payload = {
        firstName: firstNameVal,
        lastName: lastNameVal,
        mobileNumber: verifiedMobile,
        email: emailVal,
        monthlySalary: formattedSalary,
        salaryAmount: salaryNum,
        employmentType: employmentVal,
        panNumber: panVal,
        city: cityVal,
        consentGranted: true,
        submittedAt: new Date().toISOString(),
        tracking: attributionData
      };

      submitLead(payload);
    });
  }

  /* ==========================================================================
     5. INTERACTIVE EMI & LOAN CALCULATOR
     ========================================================================== */
  function formatINR(val) {
    return '₹' + Math.round(val).toLocaleString('en-IN');
  }

  function initEMICalculator() {
    const amountSlider = document.getElementById('calcAmountSlider');
    const amountDisplay = document.getElementById('calcAmountDisplay');
    const rateSlider = document.getElementById('calcRateSlider');
    const rateDisplay = document.getElementById('calcRateDisplay');
    const emiDisplay = document.getElementById('calcEmiDisplay');
    const totalInterestDisplay = document.getElementById('calcTotalInterestDisplay');
    const totalPayableDisplay = document.getElementById('calcTotalPayableDisplay');
    const principalDisplay = document.getElementById('calcPrincipalDisplay');
    const rateBreakdownDisplay = document.getElementById('calcRateBreakdownDisplay');
    const tenureBreakdownDisplay = document.getElementById('calcTenureBreakdownDisplay');
    const ratioPrincipal = document.getElementById('ratioPrincipal');
    const ratioInterest = document.getElementById('ratioInterest');
    const presetButtons = document.querySelectorAll('.js-preset-amount');
    const ratePresetButtons = document.querySelectorAll('.js-preset-rate');
    const tenureButtons = document.querySelectorAll('.js-tenure-btn');
    const applyWithPlanBtn = document.getElementById('applyWithPlanBtn');

    if (!amountSlider) return;

    let currentAmount = Number(amountSlider.value) || 50000;
    let currentRatePercent = rateSlider ? Number(rateSlider.value) || 18 : 18;
    let currentTenureMonths = 12;

    function recalculate() {
      const P = currentAmount;
      const n = currentTenureMonths;
      const annualRateDecimal = currentRatePercent / 100;
      const r = annualRateDecimal / 12; // monthly rate

      // EMI Formula: E = P * r * (1 + r)^n / ((1 + r)^n - 1)
      const compoundFactor = Math.pow(1 + r, n);
      const monthlyEmi = (P * r * compoundFactor) / (compoundFactor - 1);
      const totalPayable = monthlyEmi * n;
      const totalInterest = Math.max(0, totalPayable - P);

      // Update text outputs
      if (amountDisplay) amountDisplay.textContent = formatINR(P);
      if (rateDisplay) rateDisplay.textContent = currentRatePercent.toFixed(1) + '%';
      if (rateBreakdownDisplay) rateBreakdownDisplay.textContent = currentRatePercent.toFixed(1) + '%';
      if (tenureBreakdownDisplay) tenureBreakdownDisplay.textContent = currentTenureMonths + ' Months';
      if (emiDisplay) emiDisplay.textContent = formatINR(monthlyEmi);
      if (principalDisplay) principalDisplay.textContent = formatINR(P);
      if (totalInterestDisplay) totalInterestDisplay.textContent = formatINR(totalInterest);
      if (totalPayableDisplay) totalPayableDisplay.textContent = formatINR(totalPayable);

      // Update ratio breakdown bar
      const principalPct = Math.min(100, Math.max(1, Math.round((P / totalPayable) * 100)));
      const interestPct = Math.max(0, 100 - principalPct);
      if (ratioPrincipal) ratioPrincipal.style.width = principalPct + '%';
      if (ratioInterest) ratioInterest.style.width = interestPct + '%';

      if (applyWithPlanBtn) {
        applyWithPlanBtn.textContent = 'Apply for ' + formatINR(P) + ' Loan Now';
      }

      // Update amount preset active state
      presetButtons.forEach(function (btn) {
        if (Number(btn.getAttribute('data-amount')) === P) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // Update rate preset active state
      ratePresetButtons.forEach(function (btn) {
        if (Number(btn.getAttribute('data-rate')) === currentRatePercent) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // Amount slider listener
    amountSlider.addEventListener('input', function (e) {
      currentAmount = Number(e.target.value);
      recalculate();
    });

    // Rate slider listener
    if (rateSlider) {
      rateSlider.addEventListener('input', function (e) {
        currentRatePercent = Number(e.target.value);
        recalculate();
      });
    }

    // Preset amount buttons
    presetButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const val = Number(btn.getAttribute('data-amount'));
        if (val) {
          currentAmount = val;
          amountSlider.value = val;
          recalculate();
        }
      });
    });

    // Preset rate buttons
    ratePresetButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const val = Number(btn.getAttribute('data-rate'));
        if (val) {
          currentRatePercent = val;
          if (rateSlider) rateSlider.value = val;
          recalculate();
        }
      });
    });

    // Tenure selection buttons
    tenureButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tenureButtons.forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        currentTenureMonths = Number(btn.getAttribute('data-tenure')) || 12;
        recalculate();
      });
    });

    // CTA scroll to lead form
    if (applyWithPlanBtn) {
      applyWithPlanBtn.addEventListener('click', function (e) {
        e.preventDefault();
        const formCard = document.getElementById('lead-form-card');
        if (formCard) {
          formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const firstInput = document.getElementById('firstName');
          if (firstInput) {
            setTimeout(function () {
              firstInput.focus();
            }, 600);
          }
        }
      });
    }

    recalculate();
  }

  /* ==========================================================================
     6. FAQ ACCORDION
     ========================================================================== */
  function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(function (item) {
      const btn = item.querySelector('.faq-question-btn');
      if (!btn) return;

      btn.addEventListener('click', function () {
        const isOpen = item.classList.contains('is-open');

        faqItems.forEach(function (other) {
          if (other !== item && other.classList.contains('is-open')) {
            other.classList.remove('is-open');
            const otherBtn = other.querySelector('.faq-question-btn');
            if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
          }
        });

        if (isOpen) {
          item.classList.remove('is-open');
          btn.setAttribute('aria-expanded', 'false');
        } else {
          item.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /* ==========================================================================
     7. MOBILE MENU & REPAY LOAN MODAL
     ========================================================================== */
  function initNavigation() {
    const menuToggle = document.getElementById('menuToggle');
    const mobileDrawer = document.getElementById('mobileDrawer');

    if (menuToggle && mobileDrawer) {
      menuToggle.addEventListener('click', function () {
        const isOpen = mobileDrawer.classList.toggle('is-open');
        menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      const drawerLinks = mobileDrawer.querySelectorAll('.mobile-nav-link');
      drawerLinks.forEach(function (link) {
        link.addEventListener('click', function () {
          mobileDrawer.classList.remove('is-open');
          menuToggle.setAttribute('aria-expanded', 'false');
        });
      });
    }

    const repayButtons = document.querySelectorAll('.js-repay-loan-btn');
    const repayModal = document.getElementById('repayModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalOkBtn = document.getElementById('modalOkBtn');

    function openRepayModal(e) {
      if (e) e.preventDefault();
      if (repayModal) {
        repayModal.classList.add('is-active');
        repayModal.setAttribute('aria-hidden', 'false');
      }
    }

    function closeRepayModal() {
      if (repayModal) {
        repayModal.classList.remove('is-active');
        repayModal.setAttribute('aria-hidden', 'true');
      }
    }

    repayButtons.forEach(function (btn) {
      btn.addEventListener('click', openRepayModal);
    });

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeRepayModal);
    if (modalOkBtn) modalOkBtn.addEventListener('click', closeRepayModal);
    if (repayModal) {
      repayModal.addEventListener('click', function (e) {
        if (e.target === repayModal) closeRepayModal();
      });
    }

    // Privacy Policy Modal
    const privacyModal = document.getElementById('privacyModal');
    const privacyButtons = document.querySelectorAll('.js-privacy-btn');
    const privacyCloseButtons = document.querySelectorAll('.js-close-privacy');

    function openPrivacyModal(e) {
      if (e) e.preventDefault();
      if (privacyModal) {
        privacyModal.classList.add('is-active');
        privacyModal.setAttribute('aria-hidden', 'false');
      }
    }

    function closePrivacyModal() {
      if (privacyModal) {
        privacyModal.classList.remove('is-active');
        privacyModal.setAttribute('aria-hidden', 'true');
      }
    }

    privacyButtons.forEach(function (btn) {
      btn.addEventListener('click', openPrivacyModal);
    });
    privacyCloseButtons.forEach(function (btn) {
      btn.addEventListener('click', closePrivacyModal);
    });
    if (privacyModal) {
      privacyModal.addEventListener('click', function (e) {
        if (e.target === privacyModal) closePrivacyModal();
      });
    }

    // Terms of Service Modal
    const termsModal = document.getElementById('termsModal');
    const termsButtons = document.querySelectorAll('.js-terms-btn');
    const termsCloseButtons = document.querySelectorAll('.js-close-terms');

    function openTermsModal(e) {
      if (e) e.preventDefault();
      if (termsModal) {
        termsModal.classList.add('is-active');
        termsModal.setAttribute('aria-hidden', 'false');
      }
    }

    function closeTermsModal() {
      if (termsModal) {
        termsModal.classList.remove('is-active');
        termsModal.setAttribute('aria-hidden', 'true');
      }
    }

    termsButtons.forEach(function (btn) {
      btn.addEventListener('click', openTermsModal);
    });
    termsCloseButtons.forEach(function (btn) {
      btn.addEventListener('click', closeTermsModal);
    });
    if (termsModal) {
      termsModal.addEventListener('click', function (e) {
        if (e.target === termsModal) closeTermsModal();
      });
    }
  }

  /* ==========================================================================
     8. TRUST METRICS INTERACTION & REACTIVE COUNTER
     ========================================================================== */
  function initTrustMetricsInteraction() {
    // Smooth count-up reaction when trust metrics section enters view

    // Smooth count-up reaction when trust metrics section enters view
    const trustSection = document.getElementById('trust-metrics');
    if (!trustSection || !('IntersectionObserver' in window)) return;

    let hasCounted = false;
    const countObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !hasCounted) {
            hasCounted = true;
            observer.unobserve(entry.target);

            // Animate Max Disbursal
            const el1 = document.getElementById('statMaxDisbursal');
            if (el1) {
              animateValue(el1, 0, 100000, 1000, function (val) {
                return '₹' + Math.round(val).toLocaleString('en-IN');
              });
            }

            // Animate Application Time
            const el2 = document.getElementById('statAppTime');
            if (el2) {
              animateValue(el2, 0, 2, 800, function (val) {
                return Math.round(val) + ' Minutes';
              });
            }

            // Animate 100% Digital
            const el3 = document.getElementById('statDigital');
            if (el3) {
              animateValue(el3, 0, 100, 900, function (val) {
                return Math.round(val) + '% Digital';
              });
            }
          }
        });
      },
      { threshold: 0.25 }
    );

    countObserver.observe(trustSection);
  }

  function animateValue(el, start, end, duration, formatter) {
    const startTime = performance.now();
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      el.textContent = formatter ? formatter(current) : Math.round(current);
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = formatter ? formatter(end) : end;
      }
    }
    requestAnimationFrame(update);
  }


  /* ==========================================================================
     9. SCROLL OBSERVER (Gentle fade & slide in)
     ========================================================================== */
  function initScrollAnimation() {
    document.querySelectorAll('.fade-in-section').forEach(function (el) {
      el.classList.add('is-visible');
    });

    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.01,
        rootMargin: '50px 0px 50px 0px'
      }
    );

    document.querySelectorAll('.fade-in-section').forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ==========================================================================
     INITIALIZATION
     ========================================================================== */
  function initApp() {
    try { initLeadForm(); } catch (e) { console.error('initLeadForm error:', e); }
    try { initEMICalculator(); } catch (e) { console.error('initEMICalculator error:', e); }
    try { initFAQ(); } catch (e) { console.error('initFAQ error:', e); }
    try { initNavigation(); } catch (e) { console.error('initNavigation error:', e); }
    try { initTrustMetricsInteraction(); } catch (e) { console.error('initTrustMetricsInteraction error:', e); }
    try { initScrollAnimation(); } catch (e) { console.error('initScrollAnimation error:', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
