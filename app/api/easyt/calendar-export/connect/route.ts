import { NextResponse } from 'next/server';
import { requireEasyTOwner } from '@/lib/easyt/owner';
import { getMorroviaAuthBaseURL } from '@/lib/easyt/auth-environment';
import { beginCalendarExportConsent, requireCalendarExportConfigured } from '@/lib/easyt/calendar-export-auth.server';
import { calendarExportStatus } from '@/lib/easyt/calendar-export-service.server';
import { calendarMutationBody, calendarString, calendarRouteError, calendarJsonHeaders, assertCalendarExpectedOwner } from '@/lib/easyt/calendar-export-route';
export async function POST(request: Request) { try {
    requireCalendarExportConfigured();
    const owner = await requireEasyTOwner(), body = await calendarMutationBody(request, getMorroviaAuthBaseURL()), tripId = calendarString(body.tripId);
    assertCalendarExpectedOwner(request, owner.id);
    const state = await calendarExportStatus(owner.id, tripId);
    if (!state.eligibleCount && !state.hasPreviousSend)
        return NextResponse.json({ code: 'NO_EVENTS' }, { status: 400, headers: calendarJsonHeaders });
    const kind = body.kind === 'new-trip' ? 'new-trip' : 'existing-owned';
    return NextResponse.json({ url: await beginCalendarExportConsent(owner.id, tripId, kind) }, { headers: calendarJsonHeaders });
}
catch (e) {
    const { code, status } = calendarRouteError(e);
    return NextResponse.json({ code }, { status, headers: calendarJsonHeaders });
} }
