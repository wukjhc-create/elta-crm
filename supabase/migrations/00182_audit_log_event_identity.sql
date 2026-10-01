-- 00182 — D2: log_audit_event må ikke kunne forfalske HVEM der gjorde noget
--
-- Fund (2026-10-01): log_audit_event er SECURITY DEFINER og kan kaldes af authenticated (00162), men tager
-- p_user_id/p_user_email/p_user_name som PARAMETRE. En indlogget bruger kunne via direkte RPC skrive audit-rækker i en
-- anden brugers navn. Appen (createAuditLog) sender altid den rigtige bruger — fejlen er kun udnyttelig via REST.
--
-- Nu: med en bruger-session (auth.uid() sat) tvinges user_id = auth.uid(), og email/navn hentes fra profiles —
-- parametrene ignoreres. Kun service-role (auth.uid() er NULL: agenter, cron) må angive identiteten selv (agent-audit).
-- Signatur, grants og returværdi er uændrede (ingen kodeændring nødvendig).
--
-- Rollback: genskab funktionen fra 00019_audit_logs.sql (samme signatur) + grants fra 00162.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.log_audit_event(
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_log_id UUID;
    v_uid UUID := auth.uid();
    v_email TEXT;
    v_name TEXT;
BEGIN
    IF v_uid IS NOT NULL THEN
        -- Bruger-session: identiteten kommer fra JWT'en, aldrig fra kalderens parametre
        SELECT p.email, p.full_name INTO v_email, v_name FROM public.profiles p WHERE p.id = v_uid;
    ELSE
        -- service-role (agenter/cron): identitet angives af server-koden
        v_uid := p_user_id;
        v_email := p_user_email;
        v_name := p_user_name;
    END IF;

    INSERT INTO public.audit_logs (
        user_id, user_email, user_name, entity_type, entity_id, entity_name,
        action, action_description, changes, metadata, ip_address, user_agent
    ) VALUES (
        v_uid, v_email, v_name, p_entity_type, p_entity_id, p_entity_name,
        p_action, p_action_description, p_changes, p_metadata, p_ip_address, p_user_agent
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, text, uuid, text, text, text, jsonb, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, text, uuid, text, text, text, jsonb, jsonb, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
