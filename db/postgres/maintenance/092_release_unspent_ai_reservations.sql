-- #92 OPTIONAL FALLBACK ONLY (the app now releases these rows itself). Preview-only cleanup: release AI budget reservations that never reached the AI Gateway.
-- Idempotent: running it again deletes nothing. Run ONLY against the preview database, by PM.
-- The rows removed are the hard-coded 'acceptance:2026-10-14:*' ledger rows that preview readiness inserted
-- (reconcileAiAcceptanceCharges + prebookNewsAcceptance, removed in #92). The harimu-preview gateway logged zero
-- requests, so none of them were sent through it. Real reservations (UUID / notable:/ cabinet ids) are kept.
-- Stale 'pending' rows need no cleanup: since #92 they stop counting after 1h and are deleted on the next reservation.
DELETE FROM harimu_ai_reservations WHERE request_id LIKE 'acceptance:%';
