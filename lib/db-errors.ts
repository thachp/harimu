/** #306 (from QA1 on #277/#293): classify database errors so a read can tolerate only the exact failure it expects. */
const describe = (error: unknown) => String((error as { code?: string })?.code ?? '') + ' ' + String((error as Error)?.message ?? error);
/** A table or view that is not migrated yet: SQLite "no such table", Postgres 42P01 / "does not exist". */
export const isMissingRelation = (error: unknown) => /no such table|does not exist|42P01/i.test(describe(error));
/** A unique-constraint collision (SQLite "UNIQUE constraint failed", Postgres 23505): a concurrent identical write. */
export const isUniqueViolation = (error: unknown) => /UNIQUE constraint|23505|duplicate key/i.test(describe(error));
/** `.catch(tolerate(isMissingRelation, fallback))`: swallow only the matching error, rethrow everything else. */
export const tolerate = <T>(matches: (error: unknown) => boolean, fallback: T) => (error: unknown): T => { if (matches(error)) return fallback; throw error; };
