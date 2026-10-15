/** Player notices for the AI kill switches (issue #579). Content only: the switches, the mod console and every panel that would show these
 * notices are other work, and nothing imports this module. Canon: harimu-docs systems/moderation-safety §21.3 (tools include per-persona and
 * global AI kill switches) and §21.4 (Kill switches: "Staff can mute a persona's narrative output, freeze a nation's major decisions (the
 * utility model continues) or switch all narrative to templates, instantly and logged"), and the MVP Scope Integrity row (AI kill switches).
 *
 * What a citizen sees: a persona's speeches, broadcasts, gazette lines or Notable replies are muted (a short notice stands where they would
 * appear, plus a Notables-panel variant); a nation's major decisions are frozen (a strip for the leader panel); or narrative is switched to
 * templates (a small footer for templated items). One plain explainer is shared by all three.
 *
 * Voice: out-of-character and neutral, one set of lines for every nation. It must not read as State Media, a gazette or a newspaper, so
 * there is no nation key, no byline and no nation-voice word. No line names the staff member or says why a switch was used, and none says
 * when it will end: the one optional time is the {until} placeholder, a pre-formatted string filled only when the code knows a time (the
 * strip has a variant with it and a variant without). The docs say the utility model continues during a freeze, but they do not say what
 * else keeps running, so no line makes a claim about services or play. Badge rule (#381 / ui-ux §23.2): these are system lines that speak
 * about an AI, not for it, so none carries the AI badge. The muted-persona lines say plainly that the character is an AI.
 *
 * Rules: no figure and no real-world reference. Limits: labels 40, lines 100, tested with {until} filled to a local 24-character cap. All
 * wording is new: `proposal: true`. */

export const KILL_SWITCH_NAME_MAX=24;
export const KILL_SWITCH_LABEL_MAX=40;
export const KILL_SWITCH_LINE_MAX=100;
export const KILL_SWITCH_PLACEHOLDERS=['{until}'] as const;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** A persona's narrative output is muted. The notice stands where its speech, broadcast, gazette line or Notable reply would appear. */
export const personaMuted={
 label:'Statement paused',
 notice:L('Statements from this AI are paused for review.'),
 notablesPanel:L('This AI is not replying right now. Its replies are paused for review.'),
 proposal:true,
} as const;

/** A nation's major decisions are frozen. The strip for the leader panel; the time appears only when the code supplies one. */
export const decisionsFrozen={
 label:'Major decisions paused',
 strip:L('Major decisions are paused by staff.'),
 stripUntil:L('Major decisions are paused by staff until {until}.'),
 proposal:true,
} as const;

/** All narrative is switched to templates. A small footer for templated news, broadcast and gazette items. */
export const templateMode={
 label:'Standard template',
 footer:L('This text is a standard template.'),
 proposal:true,
} as const;

/** One plain explainer for all three, behind a "What does this mean?" link. */
export const killSwitchExplainer={
 label:'What does this mean?',
 lines:[
  L('Staff can pause an AI character, pause a nation\'s major decisions or switch to standard text.'),
  L('Staff use these tools when needed, and each use is logged.'),
  L('It is not part of the story, and no leader or nation chose it.'),
 ],
 proposal:true,
} as const;

export const killSwitchCopy={personaMuted,decisionsFrozen,templateMode,explainer:killSwitchExplainer,proposal:true} as const;
