/** Reasons follow the same conditions used to disable the corresponding action. */
export function firstActionReason(...conditions: Array<[boolean | undefined, string]>): string | null {
  return conditions.find(([blocked]) => blocked)?.[1] ?? null;
}
export function pendingActionReason(pending: boolean, uncertain = false): string | null {
  return firstActionReason([pending, 'An action is being saved. Please wait.'], [uncertain, 'Confirm your previous action first.']);
}

/** Greyed-out actions explain why (#84): instead of native `disabled` (which drops the control from the
 *  tab order and hides its reason from keyboard users), keep it focusable with aria-disabled, describe it
 *  with the visible reason, and show the same reason on hover. Click handlers must also guard on the reason. */
export function disabledReasonProps(reason: string | null | undefined, describedBy: string) {
  return reason
    ? { 'aria-disabled': true as const, 'aria-describedby': describedBy, title: reason, 'data-reason': 'blocked' as const }
    : { 'aria-disabled': false as const, 'aria-describedby': undefined, title: undefined, 'data-reason': undefined };
}
