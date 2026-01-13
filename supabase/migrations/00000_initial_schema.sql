-- =====================================================
-- MIGRATION 00000: Initial Schema
-- Description: Enable extensions and create custom types
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom types
CREATE TYPE user_role AS ENUM ('admin', 'user', 'technician');

CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost'
);

CREATE TYPE lead_source AS ENUM (
  'website',
  'referral',
  'email',
  'phone',
  'social',
  'other'
);

CREATE TYPE offer_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'accepted',
  'rejected',
  'expired'
);

CREATE TYPE project_status AS ENUM (
  'planning',
  'active',
  'on_hold',
  'completed',
  'cancelled'
);

CREATE TYPE project_priority AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);

CREATE TYPE message_status AS ENUM (
  'unread',
  'read',
  'archived'
);

CREATE TYPE message_type AS ENUM (
  'email',
  'sms',
  'internal',
  'note'
);

-- Common trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
