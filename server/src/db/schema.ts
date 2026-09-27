/**
 * DuckDB Schema Initialization for fenyixia
 * Migrates 14+ core business tables, primary/foreign keys, and performance indexes.
 */

export const SCHEMA_SQL = `
-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  email VARCHAR UNIQUE NOT NULL,
  emoji VARCHAR DEFAULT '😊',
  color VARCHAR DEFAULT '#4F46E5',
  avatar_url VARCHAR,
  pin_hash VARCHAR,
  password_hash VARCHAR,
  profile_completed BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bills
CREATE TABLE IF NOT EXISTS bills (
  id VARCHAR PRIMARY KEY,
  icon VARCHAR DEFAULT '🧾',
  title VARCHAR NOT NULL,
  description VARCHAR DEFAULT '',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  date VARCHAR NOT NULL,
  payer_id VARCHAR NOT NULL,
  settled BOOLEAN NOT NULL DEFAULT false,
  color VARCHAR DEFAULT '#4F46E5',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Bill Items
CREATE TABLE IF NOT EXISTS bill_items (
  id VARCHAR PRIMARY KEY,
  bill_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  qty INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);

-- 4. Bill Item Members
CREATE TABLE IF NOT EXISTS bill_item_members (
  item_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  PRIMARY KEY (item_id, user_id)
);

-- 5. Friendships
CREATE TABLE IF NOT EXISTS friendships (
  id VARCHAR PRIMARY KEY,
  user_a VARCHAR NOT NULL,
  user_b VARCHAR NOT NULL,
  alias_a VARCHAR,
  alias_b VARCHAR,
  status VARCHAR DEFAULT 'accepted',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Friend Requests
CREATE TABLE IF NOT EXISTS friend_requests (
  id VARCHAR PRIMARY KEY,
  from_user_id VARCHAR NOT NULL,
  to_user_id VARCHAR NOT NULL,
  message VARCHAR DEFAULT '',
  status VARCHAR DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Invitations
CREATE TABLE IF NOT EXISTS invitations (
  id VARCHAR PRIMARY KEY,
  inviter_id VARCHAR NOT NULL,
  token VARCHAR UNIQUE NOT NULL,
  claimed_by VARCHAR,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Groups
CREATE TABLE IF NOT EXISTS groups (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  emoji VARCHAR DEFAULT '👥',
  created_by VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Group Members
CREATE TABLE IF NOT EXISTS group_members (
  group_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  role VARCHAR DEFAULT 'member',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id)
);

-- 10. User Tags
CREATE TABLE IF NOT EXISTS user_tags (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  color VARCHAR DEFAULT '#4F46E5',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Friend Tags
CREATE TABLE IF NOT EXISTS friend_tags (
  tag_id VARCHAR NOT NULL,
  friend_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tag_id, friend_id)
);

-- 12. Payment Proofs
CREATE TABLE IF NOT EXISTS payment_proofs (
  id VARCHAR PRIMARY KEY,
  bill_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  image_url VARCHAR NOT NULL,
  note VARCHAR DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Manual Payments
CREATE TABLE IF NOT EXISTS manual_payments (
  id VARCHAR PRIMARY KEY,
  bill_id VARCHAR NOT NULL,
  payer_id VARCHAR NOT NULL,
  member_id VARCHAR NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  settled BOOLEAN NOT NULL DEFAULT true,
  settled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. Bill Disputes
CREATE TABLE IF NOT EXISTS bill_disputes (
  id VARCHAR PRIMARY KEY,
  bill_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  reason VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'pending',
  suggested_items VARCHAR,
  resolution VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

-- 15. Bill Reactions (Anger storm)
CREATE TABLE IF NOT EXISTS bill_reactions (
  id VARCHAR PRIMARY KEY,
  bill_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  reaction_type VARCHAR DEFAULT 'anger',
  seen BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. Receipt Scans
CREATE TABLE IF NOT EXISTS receipt_scans (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  image_path VARCHAR NOT NULL,
  scan_result VARCHAR NOT NULL,
  bill_id VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. API Tokens
CREATE TABLE IF NOT EXISTS api_tokens (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  token VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP
);

-- 18. Token Usage
CREATE TABLE IF NOT EXISTS token_usage (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  model VARCHAR NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 19. System Settings (Global Config like OpenAI API/OAuth Key)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR PRIMARY KEY,
  value VARCHAR NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_bills_payer ON bills(payer_id);
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_item_members_user ON bill_item_members(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_a ON friendships(user_a);
CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_bill ON payment_proofs(bill_id);
CREATE INDEX IF NOT EXISTS idx_manual_payments_bill ON manual_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_disputes_bill ON bill_disputes(bill_id);
`;
