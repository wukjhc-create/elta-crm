-- =====================================================
-- PHASE D: AI-ASSISTED PROJECT & OFFER INTELLIGENCE
-- =====================================================
-- This migration creates the foundation for AI-assisted
-- project analysis, risk assessment, and offer generation.
--
-- Architecture Notes:
-- - project_contexts: Stores parsed project information
-- - calculation_snapshots: Immutable snapshots for offers
-- - risk_assessments: Flagged risks and recommendations
-- - price_explanations: Customer-friendly breakdowns
-- - ai_prompt_templates: Future AI integration prep
-- =====================================================

-- =====================================================
-- PART 1: PROJECT CONTEXT
-- Stores structured interpretation of project descriptions
-- =====================================================

CREATE TABLE IF NOT EXISTS project_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  calculation_id UUID REFERENCES calculations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'manual', -- manual, text_input, ai_parsed
  original_text TEXT, -- Original project description if parsed

  -- Parsed project info
  project_type TEXT, -- renovation, new_build, extension, maintenance
  building_type TEXT, -- house, apartment, commercial, industrial
  building_age_years INTEGER,
  building_size_m2 DECIMAL(10,2),

  -- Detected rooms (JSONB array)
  detected_rooms JSONB DEFAULT '[]'::jsonb,
  -- Format: [{"room_type": "BEDROOM", "count": 2, "size_m2": 14, "confidence": 0.85}]

  -- Detected requirements
  detected_components JSONB DEFAULT '[]'::jsonb,
  -- Format: [{"component_code": "STIK-1-NY", "quantity": 10, "reason": "keyword: stikkontakter", "confidence": 0.9}]

  detected_quick_jobs JSONB DEFAULT '[]'::jsonb,
  -- Format: [{"job_code": "ELTAVLE-CHECK", "reason": "keyword: eltavle", "confidence": 0.8}]

  -- Customer context
  customer_priority TEXT, -- price, quality, speed, warranty
  urgency_level TEXT DEFAULT 'normal', -- low, normal, high, emergency

  -- Special conditions
  access_restrictions TEXT,
  working_hours_constraints TEXT,
  special_requirements TEXT[],

  -- Confidence metrics
  overall_confidence DECIMAL(3,2) DEFAULT 0.5,
  parsing_notes TEXT,

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_contexts_calculation ON project_contexts(calculation_id);

-- =====================================================
-- PART 2: CALCULATION SNAPSHOTS
-- Immutable snapshots of calculations for offers/history
-- =====================================================

CREATE TABLE IF NOT EXISTS calculation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source calculation
  calculation_id UUID REFERENCES calculations(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES offers(id) ON DELETE CASCADE,

  -- Snapshot version
  version INTEGER NOT NULL DEFAULT 1,
  snapshot_reason TEXT, -- offer_created, offer_updated, manual_snapshot

  -- Complete calculation state (JSONB)
  calculation_data JSONB NOT NULL,
  -- Contains: items, totals, factors, building_profile, labor_type, etc.

  -- Summary metrics (denormalized for quick access)
  total_time_minutes INTEGER,
  total_labor_cost DECIMAL(10,2),
  total_material_cost DECIMAL(10,2),
  total_price DECIMAL(10,2),
  margin_percentage DECIMAL(5,2),
  effective_hourly_rate DECIMAL(10,2),

  -- Metadata
  component_count INTEGER,
  room_count INTEGER,
  risk_level TEXT, -- low, medium, high

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calculation_snapshots_calculation ON calculation_snapshots(calculation_id);
CREATE INDEX idx_calculation_snapshots_offer ON calculation_snapshots(offer_id);

-- =====================================================
-- PART 3: RISK ASSESSMENTS
-- Flagged risks and recommendations per calculation
-- =====================================================

CREATE TYPE risk_category AS ENUM (
  'technical',      -- Technical complexity or uncertainty
  'time',           -- Time estimation uncertainty
  'legal',          -- Regulatory/compliance issues
  'safety',         -- Safety concerns
  'margin',         -- Profitability concerns
  'scope',          -- Scope creep potential
  'access',         -- Site access issues
  'material'        -- Material availability/pricing
);

CREATE TYPE risk_severity AS ENUM (
  'info',           -- Informational
  'low',            -- Minor concern
  'medium',         -- Should address
  'high',           -- Must address
  'critical'        -- Blocker
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  calculation_id UUID REFERENCES calculations(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES calculation_snapshots(id) ON DELETE CASCADE,

  -- Risk details
  category risk_category NOT NULL,
  severity risk_severity NOT NULL DEFAULT 'medium',

  -- Content
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Detection
  detection_rule TEXT, -- Which rule triggered this
  detection_data JSONB, -- Data that triggered detection
  confidence DECIMAL(3,2) DEFAULT 0.8,

  -- Recommendations
  recommendation TEXT,
  mitigation_options JSONB DEFAULT '[]'::jsonb,
  -- Format: [{"action": "Add buffer time", "impact": "+2 hours", "cost": 500}]

  -- Customer visibility
  show_to_customer BOOLEAN DEFAULT false,
  customer_message TEXT, -- Simplified message for customer

  -- Resolution
  is_acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID REFERENCES profiles(id),
  acknowledged_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_assessments_calculation ON risk_assessments(calculation_id);
CREATE INDEX idx_risk_assessments_severity ON risk_assessments(severity);

-- =====================================================
-- PART 4: PRICE EXPLANATIONS
-- Customer-friendly price breakdowns
-- =====================================================

CREATE TABLE IF NOT EXISTS price_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  calculation_id UUID REFERENCES calculations(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES calculation_snapshots(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES offers(id) ON DELETE CASCADE,

  -- Language and format
  language TEXT DEFAULT 'da',
  format TEXT DEFAULT 'detailed', -- simple, detailed, itemized

  -- Generated explanation sections (JSONB)
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Format: {
  --   "summary": "text",
  --   "labor_explanation": "text",
  --   "material_explanation": "text",
  --   "value_propositions": ["text"],
  --   "whats_included": ["text"],
  --   "whats_not_included": ["text"],
  --   "quality_guarantees": ["text"],
  --   "payment_terms": "text"
  -- }

  -- Breakdown data (for visualization)
  breakdown_data JSONB DEFAULT '{}'::jsonb,
  -- Format: {
  --   "categories": [{"name": "Arbejdsløn", "amount": 5000, "percentage": 45}],
  --   "rooms": [{"name": "Køkken", "amount": 3000}],
  --   "timeline": "2-3 dage"
  -- }

  -- Generation metadata
  template_version TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_explanations_calculation ON price_explanations(calculation_id);
CREATE INDEX idx_price_explanations_offer ON price_explanations(offer_id);

-- =====================================================
-- PART 5: AI PROMPT TEMPLATES
-- Templates for future AI integration
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Template
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  -- Variables: {{project_description}}, {{components}}, {{rooms}}, etc.

  -- Configuration
  purpose TEXT NOT NULL, -- parse_project, assess_risks, generate_text, explain_price
  model_preference TEXT DEFAULT 'claude-sonnet', -- claude-sonnet, claude-opus, gpt-4
  max_tokens INTEGER DEFAULT 2000,
  temperature DECIMAL(2,1) DEFAULT 0.3,

  -- Output schema (for structured outputs)
  output_schema JSONB,

  -- Versioning
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PART 6: OFFER GENERATION LOG
-- Track generated offer content
-- =====================================================

CREATE TABLE IF NOT EXISTS offer_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  offer_id UUID REFERENCES offers(id) ON DELETE CASCADE,
  calculation_id UUID REFERENCES calculations(id) ON DELETE SET NULL,

  -- Generation details
  generation_type TEXT NOT NULL, -- scope, exclusions, assumptions, upgrades, full

  -- Content
  generated_content JSONB NOT NULL,
  -- Format varies by type

  -- Template references
  templates_used TEXT[], -- IDs of offer_text_templates used

  -- Metrics
  generation_time_ms INTEGER,
  tokens_used INTEGER, -- For future AI tracking

  -- User actions
  was_edited BOOLEAN DEFAULT false,
  final_content JSONB, -- After user edits

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_offer_generation_log_offer ON offer_generation_log(offer_id);

-- =====================================================
-- PART 7: PROJECT KEYWORDS
-- Keywords for parsing project descriptions
-- =====================================================

CREATE TABLE IF NOT EXISTS project_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Keyword info
  keyword TEXT NOT NULL,
  keyword_type TEXT NOT NULL, -- room, component, job, condition, risk

  -- Mapping
  target_code TEXT, -- room_type code, component code, job code
  target_table TEXT, -- room_types, calc_components, quick_jobs

  -- Matching
  match_type TEXT DEFAULT 'contains', -- exact, contains, starts_with, regex
  priority INTEGER DEFAULT 0, -- Higher = more specific match

  -- Metadata
  synonyms TEXT[], -- Alternative words
  language TEXT DEFAULT 'da',

  -- Active
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_keywords_type ON project_keywords(keyword_type);
CREATE INDEX idx_project_keywords_keyword ON project_keywords(keyword);

-- =====================================================
-- PART 8: SEED DATA - Keywords
-- =====================================================

-- Room keywords (Danish)
INSERT INTO project_keywords (keyword, keyword_type, target_code, target_table, match_type, synonyms) VALUES
-- Bedrooms
('soveværelse', 'room', 'BEDROOM', 'room_types', 'contains', ARRAY['værelse', 'bedroom']),
('børneværelse', 'room', 'BEDROOM', 'room_types', 'contains', ARRAY['barneværelse']),
('gæsteværelse', 'room', 'BEDROOM', 'room_types', 'contains', ARRAY[]::text[]),
-- Living
('stue', 'room', 'LIVING', 'room_types', 'contains', ARRAY['opholdsstue', 'dagligstue']),
('alrum', 'room', 'LIVING', 'room_types', 'contains', ARRAY[]::text[]),
-- Kitchen
('køkken', 'room', 'KITCHEN', 'room_types', 'contains', ARRAY['køkkenalrum']),
-- Bathroom
('badeværelse', 'room', 'BATHROOM', 'room_types', 'contains', ARRAY['bad', 'bathroom']),
('toilet', 'room', 'BATHROOM', 'room_types', 'contains', ARRAY['wc', 'gæstetoilet']),
('bryggers', 'room', 'BATHROOM', 'room_types', 'contains', ARRAY['vaskerum']),
-- Entry
('entre', 'room', 'ENTRY', 'room_types', 'contains', ARRAY['entré', 'gang', 'forgang']),
('gang', 'room', 'ENTRY', 'room_types', 'contains', ARRAY[]::text[]),
-- Office
('kontor', 'room', 'OFFICE', 'room_types', 'contains', ARRAY['hjemmekontor', 'arbejdsværelse']),
-- Garage
('garage', 'room', 'GARAGE', 'room_types', 'contains', ARRAY['carport']),
-- Basement
('kælder', 'room', 'BASEMENT', 'room_types', 'contains', ARRAY['kælderrum']),
-- Outdoor
('have', 'room', 'OUTDOOR', 'room_types', 'contains', ARRAY['terrasse', 'altan', 'udendørs']),
-- Storage
('depot', 'room', 'STORAGE', 'room_types', 'contains', ARRAY['opbevaring', 'pulterrum']);

-- Component keywords
INSERT INTO project_keywords (keyword, keyword_type, target_code, target_table, match_type, synonyms) VALUES
('stikkontakt', 'component', 'STIK-1-NY', 'calc_components', 'contains', ARRAY['stik', 'kontakt', 'elstik']),
('dobbelt stikkontakt', 'component', 'STIK-2-NY', 'calc_components', 'contains', ARRAY['dobbelt stik', '2-stik']),
('afbryder', 'component', 'AFB-1P-NY', 'calc_components', 'contains', ARRAY['kontakt', 'lyskontakt']),
('loftlampe', 'component', 'LOFT-NY', 'calc_components', 'contains', ARRAY['loftslampe', 'loftudtag']),
('spot', 'component', 'SPOT-NY', 'calc_components', 'contains', ARRAY['spots', 'spotlights', 'downlight']),
('eltavle', 'component', NULL, 'calc_components', 'contains', ARRAY['gruppetavle', 'sikringstavle']),
('hpfi', 'component', NULL, 'calc_components', 'contains', ARRAY['hpfi-relæ', 'fejlstrømsrelæ', 'rcd']),
('emhætte', 'component', NULL, 'calc_components', 'contains', ARRAY['udsugning', 'ventilation']);

-- Risk/condition keywords
INSERT INTO project_keywords (keyword, keyword_type, target_code, target_table, match_type, synonyms) VALUES
('gammelt hus', 'risk', 'old_building', NULL, 'contains', ARRAY['ældre hus', 'gammelt byggeri']),
('renovation', 'condition', 'renovation', NULL, 'contains', ARRAY['renovering', 'ombygning']),
('nybyggeri', 'condition', 'new_build', NULL, 'contains', ARRAY['nyt hus', 'nybyg']),
('tilbygning', 'condition', 'extension', NULL, 'contains', ARRAY['udbygning']),
('udvidelse', 'condition', 'extension', NULL, 'contains', ARRAY[]::text[]),
('hastende', 'urgency', 'high', NULL, 'contains', ARRAY['haster', 'akut', 'hurtig']),
('skjulte ledninger', 'risk', 'hidden_wiring', NULL, 'contains', ARRAY['skjult installation', 'forsænket']);

-- =====================================================
-- PART 9: RISK DETECTION RULES
-- Rules for automatic risk detection
-- =====================================================

CREATE TABLE IF NOT EXISTS risk_detection_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule identity
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Category and severity
  category risk_category NOT NULL,
  default_severity risk_severity NOT NULL DEFAULT 'medium',

  -- Detection logic (JSONB)
  conditions JSONB NOT NULL,
  -- Format: {
  --   "type": "threshold|presence|absence|combination",
  --   "field": "building_age_years",
  --   "operator": ">",
  --   "value": 30,
  --   "and": [...],
  --   "or": [...]
  -- }

  -- Messages
  title_template TEXT NOT NULL,
  description_template TEXT NOT NULL,
  recommendation_template TEXT,
  customer_message_template TEXT,

  -- Configuration
  show_to_customer BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed risk detection rules
INSERT INTO risk_detection_rules (code, name, category, default_severity, conditions, title_template, description_template, recommendation_template, show_to_customer, customer_message_template) VALUES

('OLD_BUILDING_30', 'Old Building (30+ years)', 'technical', 'medium',
 '{"type": "threshold", "field": "building_age_years", "operator": ">=", "value": 30}'::jsonb,
 'Ældre bygning',
 'Bygningen er over 30 år gammel. Der kan være ældre el-installationer der kræver ekstra opmærksomhed.',
 'Tilføj 10-15% buffer til tidsestimatet for uforudsete udfordringer.',
 true,
 'Vi tager ekstra højde for at din bygning er ældre, hvilket kan kræve tilpasning af eksisterende installationer.'),

('OLD_BUILDING_50', 'Very Old Building (50+ years)', 'technical', 'high',
 '{"type": "threshold", "field": "building_age_years", "operator": ">=", "value": 50}'::jsonb,
 'Meget ældre bygning',
 'Bygningen er over 50 år gammel. El-installationer kan være forældede og kræve omfattende opdatering.',
 'Anbefal eltjek før arbejdet påbegyndes. Tilføj 20% buffer.',
 true,
 'Din bygning kræver særlig opmærksomhed grundet alderen. Vi anbefaler et grundigt eltjek.'),

('LOW_MARGIN', 'Low Profit Margin', 'margin', 'high',
 '{"type": "threshold", "field": "margin_percentage", "operator": "<", "value": 15}'::jsonb,
 'Lav avance',
 'Den beregnede avance er under 15%. Dette kan påvirke projektets rentabilitet.',
 'Gennemgå priserne eller reducer scope. Overvej materialealternativer.',
 false, NULL),

('NEGATIVE_MARGIN', 'Negative Margin', 'margin', 'critical',
 '{"type": "threshold", "field": "margin_percentage", "operator": "<", "value": 0}'::jsonb,
 'Negativ avance',
 'Projektet har negativ avance! Prisen dækker ikke omkostningerne.',
 'STOP: Gennemgå alle priser og omkostninger før tilbud sendes.',
 false, NULL),

('HIGH_COMPONENT_COUNT', 'Complex Project', 'time', 'medium',
 '{"type": "threshold", "field": "component_count", "operator": ">", "value": 50}'::jsonb,
 'Komplekst projekt',
 'Projektet indeholder mange komponenter (50+). Dette øger kompleksiteten og risikoen for forsinkelser.',
 'Overvej at opdele projektet i faser. Tilføj koordineringstid.',
 false, NULL),

('BATHROOM_WORK', 'Bathroom Electrical Work', 'safety', 'medium',
 '{"type": "presence", "field": "rooms", "contains": "BATHROOM"}'::jsonb,
 'El-arbejde i badeværelse',
 'Projektet inkluderer el-arbejde i vådrum. Særlige IP-krav og sikkerhedsregler gælder.',
 'Verificer IP-klassificering på alle komponenter. HPFI er påkrævet.',
 true,
 'El-arbejde i badeværelser udføres efter strenge sikkerhedsregler med vandtætte komponenter.'),

('OUTDOOR_WORK', 'Outdoor Electrical Work', 'safety', 'medium',
 '{"type": "presence", "field": "rooms", "contains": "OUTDOOR"}'::jsonb,
 'Udendørs el-arbejde',
 'Projektet inkluderer udendørs el-installationer. Vejrlig og IP-krav skal overvejes.',
 'Brug IP65+ komponenter. Planlæg for vejrforhold.',
 true,
 'Udendørs installationer udføres med vejrbestandige materialer til lang holdbarhed.');

-- =====================================================
-- PART 10: RLS POLICIES
-- =====================================================

ALTER TABLE project_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_explanations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_generation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_detection_rules ENABLE ROW LEVEL SECURITY;

-- Select policies (authenticated users can read)
CREATE POLICY "project_contexts_select" ON project_contexts FOR SELECT TO authenticated USING (true);
CREATE POLICY "calculation_snapshots_select" ON calculation_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "risk_assessments_select" ON risk_assessments FOR SELECT TO authenticated USING (true);
CREATE POLICY "price_explanations_select" ON price_explanations FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_prompt_templates_select" ON ai_prompt_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "offer_generation_log_select" ON offer_generation_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_keywords_select" ON project_keywords FOR SELECT TO authenticated USING (true);
CREATE POLICY "risk_detection_rules_select" ON risk_detection_rules FOR SELECT TO authenticated USING (true);

-- Insert policies
CREATE POLICY "project_contexts_insert" ON project_contexts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "calculation_snapshots_insert" ON calculation_snapshots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "risk_assessments_insert" ON risk_assessments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "price_explanations_insert" ON price_explanations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ai_prompt_templates_insert" ON ai_prompt_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "offer_generation_log_insert" ON offer_generation_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "project_keywords_insert" ON project_keywords FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "risk_detection_rules_insert" ON risk_detection_rules FOR INSERT TO authenticated WITH CHECK (true);

-- Update policies
CREATE POLICY "project_contexts_update" ON project_contexts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "calculation_snapshots_update" ON calculation_snapshots FOR UPDATE TO authenticated USING (true);
CREATE POLICY "risk_assessments_update" ON risk_assessments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "price_explanations_update" ON price_explanations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ai_prompt_templates_update" ON ai_prompt_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "offer_generation_log_update" ON offer_generation_log FOR UPDATE TO authenticated USING (true);
CREATE POLICY "project_keywords_update" ON project_keywords FOR UPDATE TO authenticated USING (true);
CREATE POLICY "risk_detection_rules_update" ON risk_detection_rules FOR UPDATE TO authenticated USING (true);

-- Delete policies
CREATE POLICY "project_contexts_delete" ON project_contexts FOR DELETE TO authenticated USING (true);
CREATE POLICY "risk_assessments_delete" ON risk_assessments FOR DELETE TO authenticated USING (true);
CREATE POLICY "price_explanations_delete" ON price_explanations FOR DELETE TO authenticated USING (true);
CREATE POLICY "offer_generation_log_delete" ON offer_generation_log FOR DELETE TO authenticated USING (true);

-- =====================================================
-- PART 11: GRANTS
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON project_contexts TO authenticated;
GRANT SELECT, INSERT ON calculation_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON risk_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON price_explanations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ai_prompt_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON offer_generation_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON project_keywords TO authenticated;
GRANT SELECT, INSERT, UPDATE ON risk_detection_rules TO authenticated;

-- =====================================================
-- PART 12: SEED AI PROMPT TEMPLATES (for future use)
-- =====================================================

INSERT INTO ai_prompt_templates (code, name, purpose, system_prompt, user_prompt_template, output_schema) VALUES

('PARSE_PROJECT', 'Parse Project Description', 'parse_project',
'Du er en ekspert i at analysere el-projekter i Danmark. Du modtager en tekstbeskrivelse af et projekt og skal strukturere informationen.

Fokuser på:
- Hvilke rum er nævnt
- Hvilke komponenter/opgaver er nævnt
- Bygningstype og alder
- Særlige krav eller udfordringer
- Kundens prioriteter (pris, kvalitet, hastighed)

Svar KUN i det specificerede JSON format.',

'Analysér følgende projektbeskrivelse og udtræk struktureret information:

{{project_description}}

Returner JSON med: rooms, components, building_info, special_requirements, customer_priorities',

'{"type": "object", "properties": {"rooms": {"type": "array"}, "components": {"type": "array"}, "building_info": {"type": "object"}, "special_requirements": {"type": "array"}, "customer_priorities": {"type": "object"}}}'::jsonb),

('GENERATE_SCOPE', 'Generate Technical Scope', 'generate_text',
'Du er en professionel tilbudsskriver for el-firmaer i Danmark. Du skal skrive klare, præcise tekniske beskrivelser.

Stil: Professionel, teknisk korrekt, kundevenlig
Sprog: Dansk
Format: Punktform hvor relevant',

'Skriv en teknisk omfangsbeskrivelse for dette el-projekt:

Komponenter:
{{components}}

Rum:
{{rooms}}

Bygningsinfo:
{{building_info}}

Skriv 3-5 korte afsnit der beskriver arbejdets omfang.',
NULL),

('EXPLAIN_PRICE', 'Explain Price to Customer', 'explain_price',
'Du er en venlig el-installatør der forklarer priser til kunder. Brug simple ord, undgå teknisk jargon.

Mål: Kunden skal forstå værdien og føle sig tryg ved prisen.
Tone: Venlig, ærlig, professionel',

'Forklar denne pris til en kunde på en enkel måde:

Arbejdsløn: {{labor_cost}} kr
Materialer: {{material_cost}} kr
Total: {{total_price}} kr

Projekt: {{project_summary}}

Skriv 2-3 korte afsnit der forklarer hvad kunden får for pengene.',
NULL);
