-- 096: add replay_of_log_id for broadcast replay action

ALTER TABLE broadcast_queue
  ADD COLUMN IF NOT EXISTS replay_of_log_id UUID REFERENCES broadcast_logs(id);
