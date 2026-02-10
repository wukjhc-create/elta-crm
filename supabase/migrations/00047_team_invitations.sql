-- Team invitations table
CREATE TABLE IF NOT EXISTS team_invitations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);

-- Indexes
CREATE INDEX idx_team_invitations_email ON team_invitations(email);
CREATE INDEX idx_team_invitations_status ON team_invitations(status);

-- Enable RLS
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can read invitations
CREATE POLICY "Users can view team invitations" ON team_invitations
  FOR SELECT TO authenticated USING (true);

-- Only admins can insert/update/delete (enforced in server actions)
CREATE POLICY "Authenticated users can manage invitations" ON team_invitations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grant access
GRANT ALL ON team_invitations TO authenticated;
