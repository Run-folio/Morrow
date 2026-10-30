import { NextResponse } from 'next/server';
import { requireEasyTOwner } from '@/lib/easyt/owner';
import { requireCalendarExportConfigured } from '@/lib/easyt/calendar-export-auth.server';
import { calendarDestinations } from '@/lib/easyt/calendar-export-service.server';
import { calendarUuid, calendarRouteError, calendarJsonHeaders, assertCalendarExpectedOwner } from '@/lib/easyt/calendar-export-route';
export async function GET(request: Request) { try {
    requireCalendarExportConfigured();
    const owner = await requireEasyTOwner(), grantId = calendarUuid(new URL(request.url).searchParams.get('grantId'));
    assertCalendarExpectedOwner(request, owner.id);
    return NextResponse.json({ destinations: await calendarDestinations(owner.id, grantId) }, { headers: calendarJsonHeaders });
}
catch (e) {
    const { code, status } = calendarRouteError(e);
    return NextResponse.json({ code }, { status, headers: calendarJsonHeaders });
} }
