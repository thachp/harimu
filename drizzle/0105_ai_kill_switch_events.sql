-- Issue #764 slice 2: logged AI kill-switch changes (docs §21.4). Who, persona, on/off, time, reason. No account id. Flag HARIMU_KILL_SWITCH_EVENTS_ENABLED (off in production).
CREATE TABLE IF NOT EXISTS ai_kill_switch_events (
 id TEXT PRIMARY KEY,
 actor TEXT NOT NULL CHECK(actor IN ('operator')),
 persona TEXT NOT NULL CHECK(length(persona) BETWEEN 1 AND 80),
 state TEXT NOT NULL CHECK(state IN ('on','off')),
 reason TEXT NOT NULL CHECK(reason IN ('persona-mute','templates-only')),
 created_at INTEGER NOT NULL CHECK(created_at>=0)
);
CREATE INDEX IF NOT EXISTS idx_ai_kill_switch_events_created ON ai_kill_switch_events(created_at);
