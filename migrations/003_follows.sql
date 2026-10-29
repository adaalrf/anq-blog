CREATE TABLE follows (
  follower_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  followed_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);
CREATE INDEX follows_followed ON follows(followed_id);
