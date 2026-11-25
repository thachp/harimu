/** #1509: static scan for test code that writes into the repo's source tree (lib/, app/, worker/).
 *  Why static: `npm test` runs test files in parallel processes with no suite-wide setup/teardown hook, so a
 *  before/after hash of the tree can only see a mutant that happens to be on disk at the moment it looks, and a
 *  dirty developer tree would trip it. Reading the test code is deterministic and order-independent.
 *  Rule: every fs write in test code (any write, copy, rename, remove, link or mkdir call imported from node:fs or
 *  node:fs/promises) must target a path derived from a temporary location: mkdtemp*, os.tmpdir(), a mutantTree()
 *  copy, or an explicit process.env path. A target derived only from the repo (a relative 'lib/...' path, repoRoot,
 *  import.meta.url, or a function parameter such as the old in-place `mutate(file, ...)`) is reported. */

const writeFns = new Map(Object.entries({
  writeFileSync: [0], writeFile: [0], appendFileSync: [0], appendFile: [0], truncateSync: [0], truncate: [0],
  rmSync: [0], rm: [0], unlinkSync: [0], unlink: [0], rmdirSync: [0], rmdir: [0], mkdirSync: [0], mkdir: [0],
  utimesSync: [0], utimes: [0], createWriteStream: [0],
  copyFileSync: [1], copyFile: [1], cpSync: [1], cp: [1], symlinkSync: [1], symlink: [1], linkSync: [1], link: [1],
  renameSync: [0, 1], rename: [0, 1],
}));
const fsModule = String.raw`['"](?:node:)?fs(?:/promises)?['"]`;
const tempSource = /mkdtemp|\btmpdir\s*\(|process\.env\b|\bmutantTree\s*\(/;
/** Targets that are the shared tree no matter what else they contain. */
const sharedTarget = /^\s*(?:['"`](?:\.\/)?(?:lib|app|worker)\/|new URL\(\s*['"`]\.\.\/(?:lib|app|worker)\b)|\brepoRoot\b/;

/** Return the [start, end) ranges of the arguments of the call whose '(' is at `open`, splitting on top-level commas. */
function callArgs(src, open) {
  const args = []; let depth = 0, start = open + 1, quote = null, tpl = [];
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (quote === '`' && ch === '$' && src[i + 1] === '{') { tpl.push(depth); depth++; quote = null; i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (ch === '}' && tpl.length && tpl[tpl.length - 1] === depth) { tpl.pop(); quote = '`'; continue; }
      if (depth === 0) { args.push([start, i]); return args; }
      continue;
    }
    if (ch === ',' && depth === 1) { args.push([start, i]); start = i + 1; }
  }
  return args;
}

/** `src` with the contents of comments and string literals blanked (same length), so a call or assignment quoted in a
 *  string or a comment is not mistaken for code. Template-literal `${...}` expressions stay code. */
export function codeOnly(src) {
  const out = src.split(''); const tpl = []; let depth = 0;
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') { const end = src.indexOf('\n', i); const stop = end < 0 ? src.length : end; blank(i, stop); i = stop - 1; continue; }
    if (ch === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); const stop = end < 0 ? src.length : end + 2; blank(i, stop); i = stop - 1; continue; }
    if (ch === '}' && tpl.length && tpl[tpl.length - 1] === depth - 1) { tpl.pop(); depth--; i = scanString(i, '`'); continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '"' || ch === "'" || ch === '`') i = scanString(i, ch);
  }
  return out.join('');
  // Blank a string body from the quote at `start`; for templates, stop at `${` and resume code. Returns the last index consumed.
  function scanString(start, quote) {
    let i = start + 1;
    for (; i < src.length; i++) {
      if (src[i] === '\\') { blank(i, i + 2); i++; continue; }
      if (quote === '`' && src[i] === '$' && src[i + 1] === '{') { tpl.push(depth); depth++; return i + 1; }
      if (src[i] === quote) return i;
      blank(i, i + 1);
    }
    return i;
  }
}

const identifiers = (text) => new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? []);

/** Names bound to node:fs write functions in `src`, and the names of fs namespaces. */
function fsBindings(code, src) {
  const isCode = (m) => code[m.index] === src[m.index] && code[m.index] !== ' ';
  const fns = new Map(), namespaces = new Set();
  const bind = (list) => {
    for (const part of list.split(',')) {
      const m = part.trim().match(/^([\w$]+)(?:\s*(?::|as)\s*([\w$]+))?$/);
      if (m && writeFns.has(m[1])) fns.set(m[2] ?? m[1], m[1]);
    }
  };
  for (const m of src.matchAll(new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s*${fsModule}`, 'g'))) if (isCode(m)) bind(m[1]);
  for (const m of src.matchAll(new RegExp(String.raw`import\s+(?:\*\s+as\s+)?([\w$]+)\s*(?:,\s*\{([^}]*)\})?\s*from\s*${fsModule}`, 'g'))) if (isCode(m)) { namespaces.add(m[1]); if (m[2]) bind(m[2]); }
  for (const m of src.matchAll(new RegExp(String.raw`\{([^{}]*)\}[^;\n]*?=\s*await\s+(?:Promise\.all\(\[\s*)?import\(\s*${fsModule}\s*\)`, 'g'))) bind(m[1]);
  for (const m of src.matchAll(new RegExp(String.raw`(?:const|let|var)\s+([\w$]+)\s*=\s*(?:await\s+import\(\s*${fsModule}\s*\)|require\(\s*${fsModule}\s*\))`, 'g'))) if (isCode(m)) namespaces.add(m[1]);
  return { fns, namespaces };
}

/** Identifiers whose value is derived from a temporary location (fixpoint over every `name = expr` in the file). */
function tempNames(code) {
  const assigns = [];
  for (const m of code.matchAll(/(?:\b(?:const|let|var)\s+(\{[^}]*\}|\[[^\]]*\]|[\w$]+)|(?<![.\w$])([\w$]+))\s*=(?![=>])/g)) {
    const names = identifiers(m[1] ?? m[2]);
    let i = m.index + m[0].length, depth = 0;
    for (; i < code.length; i++) {
      const ch = code[i];
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) { if (depth === 0) break; depth--; }
      else if (depth === 0 && (ch === ',' || ch === ';' || ch === '\n')) break;
    }
    assigns.push({ names, rhs: code.slice(m.index + m[0].length, i) });
  }
  const temp = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const { names, rhs } of assigns) {
      if (![...names].some((n) => !temp.has(n))) continue;
      if (tempSource.test(rhs) || [...identifiers(rhs)].some((n) => temp.has(n))) { for (const n of names) temp.add(n); changed = true; }
    }
  }
  return temp;
}

/** Report every fs write in `src` whose target is not derived from a temporary location. */
export function sourceWrites(src) {
  const code = codeOnly(src);
  const { fns, namespaces } = fsBindings(code, src);
  if (!fns.size && !namespaces.size) return [];
  const temp = tempNames(code);
  const findings = [];
  const names = [...fns.keys()].map((n) => n.replace(/\$/g, '\\$'));
  const nsNames = [...namespaces].map((n) => n.replace(/\$/g, '\\$'));
  const alternatives = [];
  if (names.length) alternatives.push(String.raw`(?<![.\w$])(${names.join('|')})`);
  if (nsNames.length) alternatives.push(String.raw`\b(?:${nsNames.join('|')})(?:\.promises)?\.(${[...writeFns.keys()].join('|')})`);
  for (const m of code.matchAll(new RegExp(String.raw`(?:${alternatives.join('|')})\s*\(`, 'g'))) {
    const fn = fns.get(m[1]) ?? m[2] ?? m[1];
    const args = callArgs(code, m.index + m[0].length - 1).map(([from, to]) => src.slice(from, to));
    for (const at of writeFns.get(fn) ?? [0]) {
      const target = args[at];
      if (target === undefined) continue;
      const fromTemp = tempSource.test(target) || [...identifiers(target)].some((n) => temp.has(n));
      if (fromTemp && !sharedTarget.test(target)) continue;
      const line = code.slice(0, m.index).split('\n').length;
      findings.push({ line, call: fn, target: target.trim() });
    }
  }
  return findings;
}
