-- ==========================================================================
-- UDHAAR PORTAL - SUPABASE DATABASE & STORAGE SETUP SCRIPT
-- ==========================================================================
-- Instructions:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/kbwvzvemxvjpnrqepidz
-- 2. Go to "SQL Editor" in the left sidebar.
-- 3. Click "New query", paste this entire script, and click "Run".
-- ==========================================================================

-- Step 1: Create the 'leads' table with all required fields
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Lead Details
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    mobile_number TEXT,
    email TEXT,
    monthly_salary TEXT,
    employment_type TEXT,
    cibil_score TEXT,
    pan_number TEXT,
    city TEXT,
    
    -- Full Form Details (JSON)
    form_details JSONB DEFAULT '{}'::jsonb,
    
    -- Lead Source & UTM Tracking
    lead_source TEXT DEFAULT 'Website - Loan Application',
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    gclid TEXT,
    
    -- Documents Array (Stores uploaded document types, file names, public URLs & timestamps)
    documents JSONB DEFAULT '[]'::jsonb,
    
    -- Status Fields (Separate Lead Status vs Document Submission Status)
    lead_status TEXT DEFAULT 'New Lead',
    status TEXT DEFAULT 'New Lead',
    document_status TEXT DEFAULT 'Pending',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- For Existing Tables: Add missing columns if they do not exist
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS employment_type TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'New Lead';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS document_status TEXT DEFAULT 'Pending';

-- Step 2: Create indexes for fast searches by lead_id, mobile, and created_at
CREATE INDEX IF NOT EXISTS idx_leads_lead_id ON public.leads (lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_mobile ON public.leads (mobile_number);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);

-- Step 3: Enable Row Level Security (RLS) on leads table
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing policies if any to avoid duplicates
DROP POLICY IF EXISTS "Allow public insert leads" ON public.leads;
DROP POLICY IF EXISTS "Allow public select leads" ON public.leads;
DROP POLICY IF EXISTS "Allow public update leads" ON public.leads;

-- Step 5: Add RLS Policies so the website can insert leads and upload documents
CREATE POLICY "Allow public insert leads"
ON public.leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public select leads"
ON public.leads
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public update leads"
ON public.leads
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Step 6: Create Storage Bucket for Document uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Step 7: Storage RLS Policies for Document Bucket
DROP POLICY IF EXISTS "Allow public upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow public view documents" ON storage.objects;

CREATE POLICY "Allow public upload documents"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Allow public view documents"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'documents');

-- ==========================================================================
-- Setup Completed Successfully!
-- ==========================================================================
