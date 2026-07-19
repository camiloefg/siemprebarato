CREATE TABLE IF NOT EXISTS mercadolibre_research_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_id TEXT NOT NULL DEFAULT 'MLC' CHECK (site_id = 'MLC'),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  frequency_hours INTEGER NOT NULL DEFAULT 24 CHECK (frequency_hours BETWEEN 1 AND 168),
  schedule_hour_local SMALLINT NOT NULL DEFAULT 3 CHECK (schedule_hour_local BETWEEN 0 AND 23),
  timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  category_mode TEXT NOT NULL DEFAULT 'all_leaf'
    CHECK (category_mode IN ('all_leaf', 'selected')),
  selected_category_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  max_categories_per_run INTEGER NOT NULL DEFAULT 250
    CHECK (max_categories_per_run BETWEEN 1 AND 5000),
  request_delay_ms INTEGER NOT NULL DEFAULT 350
    CHECK (request_delay_ms BETWEEN 100 AND 10000),
  max_retries SMALLINT NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 8),
  enrich_details BOOLEAN NOT NULL DEFAULT TRUE,
  retention_days INTEGER NOT NULL DEFAULT 365 CHECK (retention_days BETWEEN 30 AND 3650),
  terms_acknowledged_at TIMESTAMPTZ,
  terms_acknowledged_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  next_run_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS mercadolibre_research_settings_set_updated_at
  ON mercadolibre_research_settings;
CREATE TRIGGER mercadolibre_research_settings_set_updated_at
BEFORE UPDATE ON mercadolibre_research_settings
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

INSERT INTO mercadolibre_research_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS mercadolibre_research_categories (
  category_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL DEFAULT 'MLC' CHECK (site_id = 'MLC'),
  name TEXT NOT NULL,
  parent_id TEXT,
  path_from_root JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_leaf BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source_item_count INTEGER,
  source_created_at TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ,
  last_ranked_at TIMESTAMPTZ,
  consecutive_no_ranking INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_no_ranking >= 0),
  raw_category JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mercadolibre_research_categories_leaf_idx
  ON mercadolibre_research_categories (is_enabled, is_leaf, last_checked_at NULLS FIRST, category_id);
CREATE INDEX IF NOT EXISTS mercadolibre_research_categories_parent_idx
  ON mercadolibre_research_categories (parent_id);

DROP TRIGGER IF EXISTS mercadolibre_research_categories_set_updated_at
  ON mercadolibre_research_categories;
CREATE TRIGGER mercadolibre_research_categories_set_updated_at
BEFORE UPDATE ON mercadolibre_research_categories
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS mercadolibre_research_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  requested_category_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  category_limit INTEGER CHECK (category_limit BETWEEN 1 AND 5000),
  categories_requested INTEGER NOT NULL DEFAULT 0 CHECK (categories_requested >= 0),
  categories_processed INTEGER NOT NULL DEFAULT 0 CHECK (categories_processed >= 0),
  categories_ranked INTEGER NOT NULL DEFAULT 0 CHECK (categories_ranked >= 0),
  categories_without_ranking INTEGER NOT NULL DEFAULT 0 CHECK (categories_without_ranking >= 0),
  categories_failed INTEGER NOT NULL DEFAULT 0 CHECK (categories_failed >= 0),
  snapshots_created INTEGER NOT NULL DEFAULT 0 CHECK (snapshots_created >= 0),
  requested_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  worker_id TEXT,
  lease_until TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS mercadolibre_research_runs_one_active_uidx
  ON mercadolibre_research_runs ((TRUE))
  WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS mercadolibre_research_runs_created_idx
  ON mercadolibre_research_runs (created_at DESC);

DROP TRIGGER IF EXISTS mercadolibre_research_runs_set_updated_at
  ON mercadolibre_research_runs;
CREATE TRIGGER mercadolibre_research_runs_set_updated_at
BEFORE UPDATE ON mercadolibre_research_runs
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS mercadolibre_research_snapshots (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES mercadolibre_research_runs(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES mercadolibre_research_categories(category_id) ON DELETE RESTRICT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rank_position SMALLINT NOT NULL CHECK (rank_position BETWEEN 1 AND 20),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('ITEM', 'PRODUCT', 'USER_PRODUCT')),
  entity_id TEXT NOT NULL,
  title TEXT,
  permalink TEXT,
  image_url TEXT,
  price NUMERIC(16, 2),
  currency_id TEXT,
  brand TEXT,
  attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
  detail_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (detail_status IN ('not_requested', 'loaded', 'not_found', 'forbidden', 'failed')),
  detail_error TEXT,
  raw_highlight JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, category_id, rank_position),
  UNIQUE (run_id, category_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS mercadolibre_research_snapshots_category_idx
  ON mercadolibre_research_snapshots (category_id, captured_at DESC, rank_position);
CREATE INDEX IF NOT EXISTS mercadolibre_research_snapshots_entity_idx
  ON mercadolibre_research_snapshots (entity_type, entity_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS mercadolibre_research_candidates (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('ITEM', 'PRODUCT', 'USER_PRODUCT')),
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (status IN ('unreviewed', 'watchlist', 'candidate', 'dismissed')),
  notes TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS mercadolibre_research_candidates_status_idx
  ON mercadolibre_research_candidates (status, updated_at DESC);

DROP TRIGGER IF EXISTS mercadolibre_research_candidates_set_updated_at
  ON mercadolibre_research_candidates;
CREATE TRIGGER mercadolibre_research_candidates_set_updated_at
BEFORE UPDATE ON mercadolibre_research_candidates
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

COMMENT ON TABLE mercadolibre_research_snapshots IS
  'Internal Mercado Libre research only. Rows must never be converted automatically into catalog products.';
