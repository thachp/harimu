-- Issue #825: Kindle vote-buying watch (docs §9.5; flag HARIMU_VOTE_BUYING_WATCH_ENABLED, off in production). Additive table of investigation events; it records that a voter voted in an election (from voter receipts), never how.
CREATE TABLE IF NOT EXISTS vote_buying_events (
 election_key TEXT COLLATE "C" NOT NULL,
 voter_id TEXT COLLATE "C" NOT NULL,
 sender_id TEXT COLLATE "C" NOT NULL,
 transfer_id TEXT COLLATE "C" NOT NULL,
 reason TEXT COLLATE "C" NOT NULL CHECK(reason IN ('party-member','campaign','ring')),
 created_at BIGINT NOT NULL,
 PRIMARY KEY(election_key, voter_id, transfer_id, reason)
);
