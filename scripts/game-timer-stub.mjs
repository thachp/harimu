/** Layout checks stub ./game-timer so they do not start the live countdown.
 *  The stub must export every runtime name app/game-timer.tsx exports. A new export
 *  (DualTimeParts, and whatever follows it) is added here instead of failing esbuild
 *  with "No matching export in stub:./game-timer". */
import { readFileSync } from 'node:fs';

const sourcePath = new URL('../app/game-timer.tsx', import.meta.url);

export function gameTimerExportNames(source = readFileSync(sourcePath, 'utf8')) {
  const names = new Set();
  for (const match of source.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^export\s+(?:const|let|class)\s+(\w+)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^export\s+\{([^}]+)\}/gm)) {
    for (const part of match[1].split(',')) {
      const piece = part.trim().replace(/^type\s+/, '');
      if (!piece || piece.startsWith('type ')) continue;
      const name = piece.split(/\s+as\s+/).pop().trim();
      if (/^\w+$/.test(name)) names.add(name);
    }
  }
  if (names.size === 0) throw new Error('app/game-timer.tsx has no runtime exports for the layout stub');
  return [...names];
}

function stubHas(stub, name) {
  return new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`).test(stub)
    || new RegExp(`export\\s+(?:const|let|class)\\s+${name}\\b`).test(stub);
}

/** Keep the caller's GameTimer body. Add a null function for every other real export. */
export function ensureGameTimerExports(stub) {
  let out = stub;
  for (const name of gameTimerExportNames()) {
    if (!stubHas(out, name)) out += ` export function ${name}(){return null}`;
  }
  for (const name of gameTimerExportNames()) {
    if (!stubHas(out, name)) throw new Error(`layout game-timer stub is missing ${name} from app/game-timer.tsx`);
  }
  return out;
}

export function gameTimerCjsExports(base = {}) {
  const out = { ...base };
  for (const name of gameTimerExportNames()) if (out[name] == null) out[name] = () => null;
  return out;
}
