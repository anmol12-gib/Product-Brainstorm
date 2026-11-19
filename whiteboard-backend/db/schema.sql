-- Repeatable bootstrap migration for the initial schema. Run before launching the app.
CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY,
  title VARCHAR(160) NOT NULL DEFAULT 'Untitled board',
  sequence BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS board_tokens (
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
  token_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id,role),
  UNIQUE (token_hash)
);
CREATE TABLE IF NOT EXISTS board_objects (
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  id UUID NOT NULL,
  body JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id,id)
);
CREATE INDEX IF NOT EXISTS idx_board_objects_order ON board_objects(board_id,created_at,id);
CREATE TABLE IF NOT EXISTS board_operations (
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL,
  sequence BIGINT NOT NULL,
  kind TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, operation_id),
  UNIQUE (board_id,sequence)
);
CREATE INDEX IF NOT EXISTS idx_board_operations_recent ON board_operations(board_id,sequence);
