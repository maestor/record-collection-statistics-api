CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  full_refresh INTEGER NOT NULL,
  username TEXT,
  release_ttl_days INTEGER NOT NULL,
  pages_processed INTEGER NOT NULL DEFAULT 0,
  collection_items_seen INTEGER NOT NULL DEFAULT 0,
  releases_refreshed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_items (
  instance_id INTEGER PRIMARY KEY,
  release_id INTEGER NOT NULL,
  folder_id INTEGER NOT NULL,
  rating INTEGER NOT NULL DEFAULT 0,
  date_added TEXT NOT NULL,
  last_seen_sync_run_id INTEGER,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (last_seen_sync_run_id) REFERENCES sync_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_items_release_id
  ON collection_items(release_id);

CREATE INDEX IF NOT EXISTS idx_collection_items_date_added
  ON collection_items(date_added);

CREATE INDEX IF NOT EXISTS idx_collection_items_last_seen_sync_run_id
  ON collection_items(last_seen_sync_run_id);

CREATE TABLE IF NOT EXISTS collection_fields (
  field_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_public INTEGER NOT NULL,
  options_json TEXT,
  lines INTEGER,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_item_field_values (
  instance_id INTEGER NOT NULL,
  field_id INTEGER NOT NULL,
  value_text TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (instance_id, field_id),
  FOREIGN KEY (instance_id) REFERENCES collection_items(instance_id) ON DELETE CASCADE,
  FOREIGN KEY (field_id) REFERENCES collection_fields(field_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS releases (
  release_id INTEGER PRIMARY KEY,
  master_id INTEGER,
  status TEXT,
  title TEXT NOT NULL,
  artists_sort TEXT,
  release_year INTEGER,
  released TEXT,
  country TEXT,
  data_quality TEXT,
  community_have INTEGER,
  community_want INTEGER,
  community_rating_count INTEGER,
  community_rating_average REAL,
  lowest_price REAL,
  num_for_sale INTEGER,
  thumb TEXT,
  cover_image TEXT,
  resource_url TEXT,
  uri TEXT,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  stale_after TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_releases_stale_after
  ON releases(stale_after);

CREATE TABLE IF NOT EXISTS release_artists (
  release_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  artist_id INTEGER,
  name TEXT NOT NULL,
  anv TEXT,
  join_text TEXT,
  role TEXT,
  tracks TEXT,
  resource_url TEXT,
  thumbnail_url TEXT,
  PRIMARY KEY (release_id, position),
  FOREIGN KEY (release_id) REFERENCES releases(release_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_release_artists_name
  ON release_artists(name);

CREATE TABLE IF NOT EXISTS release_labels (
  release_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  label_id INTEGER,
  name TEXT NOT NULL,
  catno TEXT,
  entity_type TEXT,
  entity_type_name TEXT,
  resource_url TEXT,
  thumbnail_url TEXT,
  PRIMARY KEY (release_id, position),
  FOREIGN KEY (release_id) REFERENCES releases(release_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_release_labels_name
  ON release_labels(name);

CREATE TABLE IF NOT EXISTS release_formats (
  release_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  qty TEXT,
  format_text TEXT,
  descriptions_json TEXT NOT NULL,
  PRIMARY KEY (release_id, position),
  FOREIGN KEY (release_id) REFERENCES releases(release_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_release_formats_name
  ON release_formats(name);

CREATE TABLE IF NOT EXISTS release_genres (
  release_id INTEGER NOT NULL,
  genre TEXT NOT NULL,
  PRIMARY KEY (release_id, genre),
  FOREIGN KEY (release_id) REFERENCES releases(release_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_release_genres_genre
  ON release_genres(genre);

CREATE TABLE IF NOT EXISTS release_styles (
  release_id INTEGER NOT NULL,
  style TEXT NOT NULL,
  PRIMARY KEY (release_id, style),
  FOREIGN KEY (release_id) REFERENCES releases(release_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_release_styles_style
  ON release_styles(style);

CREATE TABLE IF NOT EXISTS release_identifiers (
  release_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  identifier_type TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (release_id, position),
  FOREIGN KEY (release_id) REFERENCES releases(release_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS release_tracks (
  release_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  track_position TEXT,
  track_type TEXT NOT NULL,
  title TEXT NOT NULL,
  duration TEXT,
  extraartists_json TEXT NOT NULL,
  PRIMARY KEY (release_id, position),
  FOREIGN KEY (release_id) REFERENCES releases(release_id) ON DELETE CASCADE
);
