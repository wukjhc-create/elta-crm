-- =====================================================
-- AUDIT LOGS MODULE
-- Tracks who changed what and when
-- =====================================================

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who performed the action
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    user_name TEXT,

    -- What entity was affected
    entity_type TEXT NOT NULL, -- 'customer', 'lead', 'offer', 'project', etc.
    entity_id UUID,
    entity_name TEXT, -- Human-readable name for the entity

    -- What action was performed
    action TEXT NOT NULL, -- 'create', 'update', 'delete', 'status_change', etc.
    action_description TEXT, -- Human-readable description

    -- What changed (for updates)
    changes JSONB, -- { field: { old: value, new: value } }

    -- Additional context
    metadata JSONB DEFAULT '{}',

    -- Client info
    ip_address TEXT,
    user_agent TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Combined index for filtering by entity and time
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_time ON audit_logs(entity_type, entity_id, created_at DESC);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can read all, users can read their own actions
CREATE POLICY "Admins can read all audit logs" ON audit_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Users can read their own audit logs" ON audit_logs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Only server (service role) can insert audit logs
-- No policy for INSERT means only service role can insert

-- Function to log audit events from server
CREATE OR REPLACE FUNCTION log_audit_event(
    p_user_id UUID,
    p_user_email TEXT,
    p_user_name TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_entity_name TEXT,
    p_action TEXT,
    p_action_description TEXT,
    p_changes JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}',
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO audit_logs (
        user_id,
        user_email,
        user_name,
        entity_type,
        entity_id,
        entity_name,
        action,
        action_description,
        changes,
        metadata,
        ip_address,
        user_agent
    ) VALUES (
        p_user_id,
        p_user_email,
        p_user_name,
        p_entity_type,
        p_entity_id,
        p_entity_name,
        p_action,
        p_action_description,
        p_changes,
        p_metadata,
        p_ip_address,
        p_user_agent
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- Grant execute on function to authenticated users
GRANT EXECUTE ON FUNCTION log_audit_event TO authenticated;

-- View for recent activity feed
CREATE OR REPLACE VIEW v_recent_audit_logs AS
SELECT
    al.id,
    al.user_id,
    al.user_email,
    al.user_name,
    al.entity_type,
    al.entity_id,
    al.entity_name,
    al.action,
    al.action_description,
    al.changes,
    al.metadata,
    al.created_at
FROM audit_logs al
ORDER BY al.created_at DESC;

-- Grant select on view
GRANT SELECT ON v_recent_audit_logs TO authenticated;

COMMENT ON TABLE audit_logs IS 'Tracks all significant actions in the system for audit purposes';
COMMENT ON COLUMN audit_logs.changes IS 'JSON object containing field-level changes: { "field_name": { "old": "value", "new": "value" } }';
