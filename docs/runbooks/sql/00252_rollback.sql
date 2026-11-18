-- Rollback af 00252 (customer_tasks.customer_visible + værn). Bevist på staging: struktur-md5 = før.
-- Koden efter portal-sikkerhedsreviewet KRÆVER kolonnen (portalen viser ellers ingen besigtigelser — fail closed);
-- rul derfor koden tilbage samtidig, eller accepter at portalen ikke viser besigtigelser.
BEGIN;
DROP TRIGGER IF EXISTS trg_customer_tasks_visibility_guard ON public.customer_tasks;
DROP FUNCTION IF EXISTS public.customer_tasks_visibility_guard();
ALTER TABLE public.customer_tasks DROP COLUMN IF EXISTS customer_visible;
COMMIT;
