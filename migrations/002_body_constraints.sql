ALTER TABLE posts ADD CONSTRAINT posts_body_content CHECK (
  (deleted AND body = '') OR (NOT deleted AND length(trim(body)) BETWEEN 1 AND 2000)
);
