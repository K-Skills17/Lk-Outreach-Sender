-- Index for duplicate check by phone (Lead Gen integration)
CREATE INDEX IF NOT EXISTS idx_leads_contact_phone ON leads(contact_phone);
