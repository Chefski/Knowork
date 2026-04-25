ALTER TABLE completed_entries
  ADD COLUMN work_id TEXT;

CREATE UNIQUE INDEX idx_completed_entries_room_work_id
  ON completed_entries (room_code, work_id)
  WHERE work_id IS NOT NULL;
