CREATE TABLE IF NOT EXISTS mercadolibre_research_run_categories (
  run_id UUID NOT NULL REFERENCES mercadolibre_research_runs(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES mercadolibre_research_categories(category_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'ranked', 'no_ranking', 'failed')),
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  snapshot_count SMALLINT NOT NULL DEFAULT 0 CHECK (snapshot_count BETWEEN 0 AND 20),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, category_id)
);

CREATE INDEX IF NOT EXISTS mercadolibre_research_run_categories_status_idx
  ON mercadolibre_research_run_categories (run_id, status, category_id);

DROP TRIGGER IF EXISTS mercadolibre_research_run_categories_set_updated_at
  ON mercadolibre_research_run_categories;
CREATE TRIGGER mercadolibre_research_run_categories_set_updated_at
BEFORE UPDATE ON mercadolibre_research_run_categories
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

COMMENT ON TABLE mercadolibre_research_run_categories IS
  'Per-category checkpoints make interrupted Mercado Libre runs resumable and idempotent.';
