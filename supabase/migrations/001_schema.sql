-- LK Outreach Sender: leads + sends only. No payments, no tiers.
-- Lead gen tool syncs leads here; we generate message and send WhatsApp + email.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Leads: one row per lead from your lead generation tool
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  business_name TEXT,
  industry TEXT,
  raw_payload JSONB,
  summary TEXT,
  generated_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_external_id ON leads(external_id);
CREATE INDEX idx_leads_email ON leads(contact_email);
CREATE INDEX idx_leads_created_at ON leads(created_at);

-- Sends: one row per channel per lead (whatsapp + email)
CREATE TABLE sends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'replied')),
  sent_at TIMESTAMPTZ,
  reply_at TIMESTAMPTZ,
  reply_text TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sends_lead_id ON sends(lead_id);
CREATE INDEX idx_sends_status ON sends(status);
CREATE INDEX idx_sends_pending ON sends(lead_id, channel) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_sends_updated_at BEFORE UPDATE ON sends
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

COMMENT ON TABLE leads IS 'Leads synced from lead generation tool; enriched + AI message';
COMMENT ON TABLE sends IS 'Outreach sends per channel (whatsapp/email); status and optional reply';
