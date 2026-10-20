/**
 * Udhaar Portal - Supabase Data Layer
 * Handles direct REST integration with Supabase for:
 * 1. Leads insertion (Lead ID, Create Date, form details, Lead Source, UTM tracking)
 * 2. Document file uploads to Supabase Storage
 * 3. Document metadata & URL linking to the lead record
 */

const SUPABASE_CONFIG = {
  url: 'https://kbwvzvemxvjpnrqepidz.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtid3Z6dmVteHZqcG5ycWVwaWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMDI4MDEsImV4cCI6MjEwNzg3ODgwMX0.HLMvLIPez2-IULmA-c_xUW9CZRMsKd-amj2RxeNeSjU',
  storageBucket: 'documents'
};

/**
 * Generate a friendly unique Lead ID (e.g. UP-261020-8349)
 */
function generateLeadId() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `UP-${year}${month}${day}-${rand}`;
}

/**
 * Common headers for Supabase REST API calls
 */
function getHeaders(extraHeaders = {}) {
  return {
    'apikey': SUPABASE_CONFIG.anonKey,
    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
    'Content-Type': 'application/json',
    ...extraHeaders
  };
}

/**
 * Save new Lead to Supabase `leads` table
 * @param {Object} leadData
 * @returns {Promise<{success: boolean, lead_id: string, data?: any, error?: any}>}
 */
async function saveLeadToSupabase(leadData) {
  try {
    const leadId = leadData.lead_id || generateLeadId();

    const SALARY_LABEL_MAP = {
      '0': 'Below ₹25,000',
      '1': '₹25,000 to ₹39,999',
      '2': '₹40,000 to ₹59,999',
      '3': '₹60,000 to ₹99,999',
      '4': '₹1,00,000 or more'
    };

    const CIBIL_LABEL_MAP = {
      '0': 'Below 500',
      '1': '500 to 599',
      '2': '600 to 699',
      '3': '700 to 749',
      '4': '750 or more',
      'unknown': "Don't know"
    };

    const salaryFormatted = SALARY_LABEL_MAP[leadData.monthly_salary] || leadData.monthly_salary || '';
    const cibilFormatted = CIBIL_LABEL_MAP[leadData.cibil_score] || leadData.cibil_score || '';

    const payload = {
      lead_id: leadId,
      created_at: leadData.created_at || new Date().toISOString(),
      first_name: leadData.first_name || '',
      last_name: leadData.last_name || '',
      full_name: leadData.full_name || `${leadData.first_name || ''} ${leadData.last_name || ''}`.trim(),
      mobile_number: leadData.mobile_number || '',
      email: leadData.email || '',
      monthly_salary: salaryFormatted,
      cibil_score: cibilFormatted,
      pan_number: leadData.pan_number || '',
      city: leadData.city || '',
      form_details: leadData.form_details || {},
      lead_source: leadData.lead_source || 'Website - Loan Application',
      utm_source: leadData.utm_source || '',
      utm_medium: leadData.utm_medium || '',
      utm_campaign: leadData.utm_campaign || '',
      utm_term: leadData.utm_term || '',
      utm_content: leadData.utm_content || '',
      gclid: leadData.gclid || '',
      documents: leadData.documents || [],
      status: 'New Lead',
      document_status: 'Pending'
    };

    // Save leadId in session storage for thank you page tracking
    try {
      sessionStorage.setItem('udhaar_active_lead_id', leadId);
      localStorage.setItem('udhaar_active_lead_id', leadId);
      sessionStorage.setItem('udhaar_lead_payload', JSON.stringify(payload));
    } catch (e) {
      console.warn('Storage warning', e);
    }

    let response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/leads`, {
      method: 'POST',
      headers: getHeaders({ 'Prefer': 'return=representation' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      // If document_status column is not yet in Supabase table, retry without it
      if (errText.includes('document_status')) {
        delete payload.document_status;
        response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/leads`, {
          method: 'POST',
          headers: getHeaders({ 'Prefer': 'return=representation' }),
          body: JSON.stringify(payload)
        });
      } else {
        console.error('Supabase Lead Insert Error:', response.status, errText);
        return { success: false, lead_id: leadId, error: errText };
      }
    }

    const result = await response.json();
    console.info('Supabase: Lead created successfully:', leadId, result);
    return { success: true, lead_id: leadId, data: result };
  } catch (error) {
    console.error('Supabase Network Error:', error);
    return {
      success: false,
      lead_id: leadData.lead_id || sessionStorage.getItem('udhaar_active_lead_id'),
      error: error.message
    };
  }
}

/**
 * Upload a document file to Supabase Storage
 * @param {File} file - The file object from <input type="file">
 * @param {string} docType - e.g. "pancard", "aadhaar", "salary", "bank"
 * @param {string} leadId - The unique Lead ID
 * @returns {Promise<{success: boolean, url?: string, path?: string, error?: any}>}
 */
async function uploadDocumentFileToSupabase(file, docType, leadId) {
  try {
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${leadId}/${docType}_${Date.now()}_${cleanFileName}`;

    const uploadUrl = `${SUPABASE_CONFIG.url}/storage/v1/object/${SUPABASE_CONFIG.storageBucket}/${storagePath}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: file
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('Storage upload notice (bucket might need public RLS policy):', errText);
      return { success: false, path: storagePath, error: errText };
    }

    // Public URL format
    const publicUrl = `${SUPABASE_CONFIG.url}/storage/v1/object/public/${SUPABASE_CONFIG.storageBucket}/${storagePath}`;
    return { success: true, path: storagePath, url: publicUrl };
  } catch (error) {
    console.warn('Document file upload exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update the `documents` column and separate `document_status` for an existing lead in Supabase
 * Note: Lead status ('New Lead') is preserved and NOT overwritten.
 * @param {string} leadId
 * @param {Array} documentsArray
 * @returns {Promise<{success: boolean, error?: any}>}
 */
async function updateLeadDocumentsInSupabase(leadId, documentsArray) {
  try {
    if (!leadId) {
      console.warn('No leadId provided for document update');
      return { success: false, error: 'Missing lead_id' };
    }

    // Preserves lead status as 'New Lead', sets document_status to 'Submitted'
    let updatePayload = {
      documents: documentsArray,
      document_status: 'Submitted',
      status: 'New Lead',
      updated_at: new Date().toISOString()
    };

    let response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/leads?lead_id=eq.${encodeURIComponent(leadId)}`, {
      method: 'PATCH',
      headers: getHeaders({ 'Prefer': 'return=representation' }),
      body: JSON.stringify(updatePayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      // If document_status column does not exist yet, fallback to updating documents without overwriting status
      if (errText.includes('document_status')) {
        delete updatePayload.document_status;
        response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/leads?lead_id=eq.${encodeURIComponent(leadId)}`, {
          method: 'PATCH',
          headers: getHeaders({ 'Prefer': 'return=representation' }),
          body: JSON.stringify(updatePayload)
        });
      } else {
        console.error('Supabase Document Update Error:', response.status, errText);
        return { success: false, error: errText };
      }
    }

    const updated = await response.json();
    console.info('Supabase: Documents linked to lead successfully:', leadId, updated);
    return { success: true, data: updated };
  } catch (error) {
    console.error('Supabase Document Update Exception:', error);
    return { success: false, error: error.message };
  }
}

// Attach to window for global access across scripts
window.UdhaarSupabase = {
  config: SUPABASE_CONFIG,
  generateLeadId: generateLeadId,
  saveLead: saveLeadToSupabase,
  uploadFile: uploadDocumentFileToSupabase,
  updateDocuments: updateLeadDocumentsInSupabase
};
