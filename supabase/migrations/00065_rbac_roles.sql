-- Migration: Add RBAC roles (admin, serviceleder, montør)
-- Replaces old roles: user → serviceleder, technician → montør

-- Add new enum values
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'serviceleder';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'montør';

-- Map existing users: user → serviceleder, technician → montør
-- (Must be done in separate transaction after enum values are committed)
-- We handle this via setup-db endpoint instead, since ALTER TYPE ADD VALUE
-- cannot run inside a transaction block in some contexts.

-- Update Henrik Christensen to admin (by email pattern)
-- This will be handled by the setup-db endpoint as well.
