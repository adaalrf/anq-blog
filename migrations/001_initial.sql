CREATE TABLE members (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z][a-z0-9_]{2,29}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 300),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE posts (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES members(id),
  parent_id uuid REFERENCES posts(id),
  body text NOT NULL CHECK (length(body) <= 2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_feed ON posts(created_at DESC, id DESC) WHERE parent_id IS NULL;
CREATE INDEX posts_replies ON posts(parent_id, created_at, id);
