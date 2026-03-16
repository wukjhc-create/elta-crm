-- Add "scope" column to offers table for detailed task scope description
-- Separate from "description" which is a short summary

ALTER TABLE offers ADD COLUMN IF NOT EXISTS scope TEXT;

COMMENT ON COLUMN offers.scope IS 'Opgavens omfang — detailed scope description visible to customer on PDF and portal';
