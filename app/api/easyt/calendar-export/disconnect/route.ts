import { NextResponse } from 'next/server';
import { requireEasyTOwner } from '@/lib/easyt/owner';
import { getMorroviaAuthBaseURL } from '@/lib/easyt/auth-environment';
import { requireCalendarExportConfigured, disconnectCalendarGrant } from '@/lib/easyt/calendar-export-auth.server';
import { calendarMutationBody, calendarUuid, calendarRouteError, calendarJsonHeaders, assertCalendarExpectedOwner } from '@/lib/easyt/calendar-export-route';
export async function POST(request: Request) { try {
    requireCalendarExportConfigured();
    const owner = await requireEasyTOwner(), body = await calendarMutationBody(request, getMorroviaAuthBaseURL());
    assertCalendarExpectedOwner(request, owner.id);
    await disconnectCalendarGrant(owner.id, calendarUuid(body.grantId));
    return NextResponse.json({ disconnected: true }, { headers: calendarJsonHeaders });
}
catch (e) {
    const { code, status } = calendarRouteError(e);
    return NextResponse.json({ code }, { status, headers: calendarJsonHeaders });
} }
