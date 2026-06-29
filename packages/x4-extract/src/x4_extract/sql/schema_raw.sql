-- schema_raw.sql
-- Table definition for the raw datalake XML dump

CREATE TABLE IF NOT EXISTS raw_files (
    filepath TEXT PRIMARY KEY,
    directory TEXT NOT NULL,
    filename TEXT NOT NULL,
    content TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_directory ON raw_files(directory);
