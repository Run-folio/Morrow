export function calendarExportCanSend(input: {
    savedRevision: string;
    reviewRevision: string;
    selected: number;
    busy: boolean;
}) { return !input.busy && input.savedRevision === input.reviewRevision && input.selected > 0; }
const messages: Record<string, string> = {
    NOT_CONFIGURED: 'Calendar export is not available yet.', UNAUTHORIZED: 'Sign in and save this trip before adding events.', AUTH_REQUIRED: 'Reconnect Google to continue. Your previous exports are remembered.', ACCESS_DENIED: 'Google did not allow this action. Check calendar access and reconnect.', MISSING_SCOPES: 'Google Calendar permission is needed to continue.', EXISTING_CONSENT_REQUIRED: 'Reconnect Google to choose an existing calendar.', CREATE_CONSENT_REQUIRED: 'Connect Google with permission to create a trip calendar.', STALE_REVIEW: 'The saved trip changed. Refresh the preview before sending.', STALE_CONTEXT: 'The trip or account changed. Open the calendar preview again.', GOOGLE_CHANGED: 'Changed in Google — left unchanged.', GOOGLE_REMOVED: 'Removed in Google — left unchanged.', IDENTITY_CONFLICT: 'This event matches multiple previous exports. No calendar changes were made for it.', CALENDAR_CREATION_UNCERTAIN: 'Check Google for the new trip calendar, then choose it here. A second calendar has not been created.', DESTINATION_UNAVAILABLE: 'The selected calendar is unavailable. Choose a calendar again.', ACCOUNT_CHANGED: 'The Google account changed. Choose the destination again.', BUSY_OR_NOT_FOUND: 'Another calendar action may still be running. Try again shortly.', BUSY: 'Another calendar action is running. Try again shortly.', RETRY_REMAINING: 'A previous send needs checking. Retry its remaining events first.', LEASE_LOST: 'The calendar action was interrupted. Reopen it to check the remaining events.', PROVIDER_UNAVAILABLE: 'Google Calendar is temporarily unavailable. Try again.', UNCERTAIN: 'Google may have received some changes. Retry remaining to check them safely.', EXISTING_CALENDAR_REVIEW_REQUIRED: 'This trip calendar already has exports. Choose it from existing calendars to review changes.', NO_EVENTS: 'Add dates to your trip events before exporting.',
};
export function calendarExportErrorCopy(code: string) { return messages[code] ?? 'Calendar changes could not be completed. Reopen the preview to try again.'; }
export function calendarExportCanManage(status: {
    eligibleCount: number;
    hasPreviousSend: boolean;
}) { return status.eligibleCount > 0 || status.hasPreviousSend; }
/** Calendar end dates are exclusive; the review shows occupied dates. */
export function calendarExportDateLabel(start: string, end: string) {
    const first = new Date(`${start}T00:00:00Z`), last = new Date(`${end}T00:00:00Z`);
    if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()))
        return start;
    last.setUTCDate(last.getUTCDate() - 1);
    const formatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    const label = formatter.format(first);
    return first.getTime() === last.getTime() ? label : `${label} – ${formatter.format(last)}`;
}
