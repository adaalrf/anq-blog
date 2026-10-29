ALTER TABLE members ADD COLUMN is_moderator boolean NOT NULL DEFAULT false;
ALTER TABLE posts ADD COLUMN removed boolean NOT NULL DEFAULT false;
CREATE TABLE hidden_posts (
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(member_id,post_id)
);
CREATE TABLE reports (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES posts(id),
  reporter_id uuid NOT NULL REFERENCES members(id),
  reason text NOT NULL CHECK (reason IN ('spam','abuse','other')),
  details text NOT NULL DEFAULT '' CHECK (length(details)<=1000),
  body_snapshot text NOT NULL CHECK (length(body_snapshot)<=2000),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','dismissed','removed')),
  decision_note text NOT NULL DEFAULT '' CHECK (length(decision_note)<=500),
  reviewed_by uuid REFERENCES members(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id,reporter_id),
  CHECK ((state='open' AND reviewed_by IS NULL AND reviewed_at IS NULL AND decision_note='') OR
         (state<>'open' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(trim(decision_note))>0))
);
CREATE INDEX reports_queue ON reports(state,created_at DESC,id DESC);
