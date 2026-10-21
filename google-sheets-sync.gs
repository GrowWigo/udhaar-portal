/**
 * Udhaar Portal - Supabase to Google Sheets Real-Time Webhook Sync
 * 
 * Features:
 * 1. Only Date formatted as DD-MM-YYYY (e.g. 21-10-2026)
 * 2. Separate columns for each document link (PAN Card, Aadhaar Card, Salary Slip, Bank Statement)
 * 3. Real-time updates: Automatically matches Lead ID and updates row when documents are submitted
 */

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const rawData = e.postData ? e.postData.contents : null;
    if (!rawData) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No data received" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const payload = JSON.parse(rawData);

    // Supabase webhook payload: { type: 'INSERT'|'UPDATE', record: {...}, old_record: {...} }
    const record = payload.record || payload;

    // Defined Headers
    const headers = [
      "Lead ID",
      "Create Date",
      "Full Name",
      "Mobile Number",
      "Email",
      "Monthly Salary",
      "Employment Type",
      "PAN Number",
      "City",
      "Lead Status",
      "Document Status",
      "PAN Card Link",
      "Aadhaar Card Link",
      "Salary Slip Link",
      "Bank Statement Link",
      "Lead Source",
      "UTM Source",
      "UTM Medium",
      "UTM Campaign",
      "UTM Term"
    ];

    // 1. Initialize Headers if Sheet is Empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight("bold")
        .setBackground("#e6f4ea")
        .setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }

    // 2. Format Date Only (DD-MM-YYYY)
    function formatDateOnly(val) {
      if (!val) return "";
      try {
        const d = new Date(val);
        if (isNaN(d.getTime())) {
          return String(val).split("T")[0];
        }
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
      } catch (err) {
        return String(val).split("T")[0] || "";
      }
    }

    const createDateOnly = formatDateOnly(record.created_at || new Date());

    // 3. Extract Document Links into separate variables
    let panCardLink = "";
    let aadhaarCardLink = "";
    let salarySlipLink = "";
    let bankStatementLink = "";

    const docs = record.documents;
    if (docs) {
      let docArray = [];
      if (Array.isArray(docs)) {
        docArray = docs;
      } else if (typeof docs === "string") {
        try {
          docArray = JSON.parse(docs);
        } catch (err) {
          docArray = [];
        }
      }

      if (Array.isArray(docArray)) {
        docArray.forEach(function (doc) {
          if (!doc) return;
          const type = (doc.document_type || doc.type || "").toLowerCase();
          const url = doc.storage_url || doc.url || doc.publicUrl || doc.file_url || "";

          if (type.includes("pan")) {
            panCardLink = url || panCardLink;
          } else if (type.includes("aadhaar") || type.includes("adhar")) {
            aadhaarCardLink = url || aadhaarCardLink;
          } else if (type.includes("salary") || type.includes("slip")) {
            salarySlipLink = url || salarySlipLink;
          } else if (type.includes("bank") || type.includes("statement")) {
            bankStatementLink = url || bankStatementLink;
          }
        });
      }
    }

    const rowData = [
      record.lead_id || "",
      createDateOnly,
      record.full_name || `${record.first_name || ""} ${record.last_name || ""}`.trim(),
      record.mobile_number || "",
      record.email || "",
      record.monthly_salary || "",
      record.employment_type || (record.form_details ? record.form_details.employmentType : "") || "",
      record.pan_number || "",
      record.city || "",
      record.lead_status || record.status || "New Lead",
      record.document_status || "Pending",
      panCardLink,
      aadhaarCardLink,
      salarySlipLink,
      bankStatementLink,
      record.lead_source || "Website - Loan Application",
      record.utm_source || "",
      record.utm_medium || "",
      record.utm_campaign || "",
      record.utm_term || ""
    ];

    const leadId = record.lead_id;
    let foundRow = -1;

    // 4. Check if Lead ID already exists (for UPDATE events on document upload)
    if (leadId && sheet.getLastRow() > 1) {
      const leadIdColumn = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < leadIdColumn.length; i++) {
        if (String(leadIdColumn[i][0]).trim() === String(leadId).trim()) {
          foundRow = i + 2;
          break;
        }
      }
    }

    if (foundRow > 0) {
      // Update existing lead row with new document links and status
      // Preserve existing create date if not provided
      const existingDate = sheet.getRange(foundRow, 2).getValue();
      if (existingDate && !createDateOnly) {
        rowData[1] = existingDate;
      }
      sheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      // Append new lead row
      sheet.appendRow(rowData);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success", lead_id: leadId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
