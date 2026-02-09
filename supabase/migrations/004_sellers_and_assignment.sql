-- Sellers (admin/SDR) and send assignment

-- Sellers: one row per login; links to Supabase auth
CREATE TABLE IF NOT EXISTS sellers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'sdr')),
  sender_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sellers_auth_user_id ON sellers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_sellers_sender_token ON sellers(sender_token);
CREATE INDEX IF NOT EXISTS idx_sellers_role ON sellers(role);

CREATE TRIGGER update_sellers_updated_at BEFORE UPDATE ON sellers
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Sends: assign to an SDR so only that SDR's Python sender gets the item
ALTER TABLE sends ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES sellers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sends_assigned_to ON sends(assigned_to);

COMMENT ON TABLE sellers IS 'Users who log in: admin (full access) or sdr (sender token only)';
COMMENT ON COLUMN sends.assigned_to IS 'SDR who should send this message; queue API filters by this';
