ALTER TABLE sync_runs
  ADD COLUMN collection_value_minimum REAL;

ALTER TABLE sync_runs
  ADD COLUMN collection_value_median REAL;

ALTER TABLE sync_runs
  ADD COLUMN collection_value_maximum REAL;
