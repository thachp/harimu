/** Reasons follow the same conditions used to disable the corresponding action. */
export function firstActionReason(...conditions: Array<[boolean | undefined, string]>): string | null {
  return conditions.find(([blocked]) => blocked)?.[1] ?? null;
}
export function pendingActionReason(pending: boolean, uncertain = false): string | null {
  return firstActionReason([pending, 'An action is being saved. Please wait.'], [uncertain, 'Confirm your previous action first.']);
}
