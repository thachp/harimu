/** #615 AI eval harness v1: every fixture in tests/ai-evals/<feature>.json is the raw text a model returned for that feature's draft
 *  call. It goes through the feature's own parse + validator chain, imported from the real module (no model call, no network, no
 *  secrets) and pinned to the feature source in tests/ai-evals-615.test.mjs. An escape is a `must_reject` fixture the validator
 *  accepted or a `legal` one it refused; any escape fails `npm run eval:ai`. `model_stage` fixtures (injection echoes, real-world
 *  names, private-data claims) are text the deterministic validator cannot judge: the feature's check model and Llama Guard decide
 *  them. They are counted and listed, never gating, so the gap stays visible. */
import { readFileSync } from 'node:fs';

export const evalFeatures = ['news', 'notables', 'cabinet', 'town_hall', 'debate'];
/** ARC: the only fixtures allowed to be `model_stage`, by id and category, in every feature. Relabelling any other fixture fails the run. */
export const modelStageAllowed = { 'injection-echo': 'prompt-injection echo', 'real-world-name': 'real-world political name', 'private-data': 'private data leak' };
const parse = raw => { try { return JSON.parse(raw); } catch { return null; } };

/** The deterministic validator stage each feature applies to its draft reply, as the feature source does it. */
export async function featureValidators(importModule) {
  const news = await importModule('lib/ai-news.ts'), cabinet = await importModule('lib/cabinet-response-ai.ts');
  const answer = raw => Boolean(cabinet.validatedCabinetResponse(parse(raw))); // town-hall-ai generateAnswer, which debate-ai also uses
  return {
    news: raw => Boolean(news.validatedNewsIntroduction(parse(raw))), // prepareAiNews: validatedNewsIntroduction(JSON.parse(raw))
    notables: raw => Boolean(news.validatedNewsDraft(parse(raw))), // answerNotable: validatedNewsDraft(JSON.parse(raw)); a parse error throws, so it is refused too
    cabinet: answer, town_hall: answer, debate: answer,
  };
}

export const readFixtures = (feature, dir = new URL('./', import.meta.url)) => JSON.parse(readFileSync(new URL(`${feature}.json`, dir), 'utf8'));

/** Runs every fixture; returns per-feature counts and the list of escapes. */
export function runEvals(validators, fixtures = Object.fromEntries(evalFeatures.map(f => [f, readFixtures(f)]))) {
  const rows = [], escapes = [], modelStage = [];
  for (const feature of evalFeatures) {
    const row = { feature, legal: 0, accepted: 0, mustReject: 0, rejected: 0, modelStage: 0, modelStagePassed: 0 };
    for (const fixture of fixtures[feature] ?? []) {
      const accepted = validators[feature](fixture.output);
      if (fixture.expect === 'legal') { row.legal++; if (accepted) row.accepted++; else escapes.push({ feature, id: fixture.id, why: 'legal fixture refused' }); }
      else if (fixture.expect === 'must_reject') { row.mustReject++; if (!accepted) row.rejected++; else escapes.push({ feature, id: fixture.id, why: `validator escape (${fixture.category})` }); }
      else if (fixture.expect === 'model_stage') {
        row.modelStage++; modelStage.push({ feature, id: fixture.id });
        if (modelStageAllowed[fixture.id] !== fixture.category) escapes.push({ feature, id: fixture.id, why: 'model_stage not allowlisted for this id and category' });
        else if (accepted) row.modelStagePassed++; else escapes.push({ feature, id: fixture.id, why: 'model_stage fixture the validator already refuses (label it must_reject)' });
      }
      else escapes.push({ feature, id: fixture.id, why: 'fixture has no expect label' });
    }
    rows.push(row);
  }
  return { rows, escapes, modelStage };
}

export function evalTable({ rows, escapes, modelStage = [] }) {
  const n = (v, w) => String(v).padStart(w);
  const lines = ['feature     legal accepted  must_reject rejected  model_stage passed_to_model', ...rows.map(r => `${r.feature.padEnd(11)} ${n(r.legal, 5)} ${n(r.accepted, 8)}  ${n(r.mustReject, 11)} ${n(r.rejected, 8)}  ${n(r.modelStage, 11)} ${n(r.modelStagePassed, 15)}`)];
  for (const m of modelStage) lines.push(`MODEL_STAGE ${m.feature}/${m.id}: passed to the check model and Llama Guard`);
  for (const e of escapes) lines.push(`ESCAPE ${e.feature}/${e.id}: ${e.why}`);
  lines.push(escapes.length ? `FAIL: ${escapes.length} escape(s)` : 'PASS: zero validator escapes');
  return lines.join('\n');
}
