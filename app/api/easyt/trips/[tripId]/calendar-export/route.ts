import { NextResponse } from 'next/server';
import { requireEasyTOwner } from '@/lib/easyt/owner';
import { getMorroviaAuthBaseURL } from '@/lib/easyt/auth-environment';
import { calendarExportConfigured, requireCalendarExportConfigured } from '@/lib/easyt/calendar-export-auth.server';
import { calendarExportStatus, reviewCalendarExport, sendCalendarExport, createAndReviewTripCalendar, createAndSendTripCalendar, readdCalendarExport } from '@/lib/easyt/calendar-export-service.server';
import { calendarMutationBody, calendarUuid, calendarString, calendarRouteError, calendarJsonHeaders, assertCalendarExpectedOwner } from '@/lib/easyt/calendar-export-route';
import { CalendarExportError } from '@/lib/easyt/calendar-export-sync';
type Context = {
    params: Promise<{
        tripId: string;
    }>;
};
export async function GET(request: Request, context: Context) { try {
    const owner = await requireEasyTOwner();
    assertCalendarExpectedOwner(request, owner.id);
    if (!calendarExportConfigured())
        return NextResponse.json({ configured: false }, { headers: calendarJsonHeaders });
    const { tripId } = await context.params;
    return NextResponse.json({ configured: true, ...await calendarExportStatus(owner.id, tripId) }, { headers: calendarJsonHeaders });
}
catch (e) {
    const { code, status } = calendarRouteError(e);
    return NextResponse.json({ code }, { status, headers: calendarJsonHeaders });
} }
export async function POST(request: Request, context: Context) {
    try {
        requireCalendarExportConfigured();
        const owner = await requireEasyTOwner(), { tripId } = await context.params, body = await calendarMutationBody(request, getMorroviaAuthBaseURL()), grantId = calendarUuid(body.grantId);
        assertCalendarExpectedOwner(request, owner.id);
        const common = { ownerId: owner.id, tripId, grantId };
        if (body.action === 'preview')
            return NextResponse.json(await reviewCalendarExport({ ...common, expectedRevision: calendarString(body.expectedRevision), calendarId: calendarString(body.calendarId, 1024) }), { headers: calendarJsonHeaders });
        if (body.action === 'create-calendar')
            return NextResponse.json(await createAndReviewTripCalendar({ ...common, expectedRevision: calendarString(body.expectedRevision) }), { headers: calendarJsonHeaders });
        if (body.action === 'create-and-send') {
            if (!Array.isArray(body.selectedSourceKeys) || body.selectedSourceKeys.length > 500)
                throw new CalendarExportError('INVALID_SELECTION');
            return NextResponse.json(await createAndSendTripCalendar({ ...common, expectedRevision: calendarString(body.expectedRevision), selectedSourceKeys: body.selectedSourceKeys.map(x => calendarString(x, 1024)), idempotencyKey: calendarUuid(body.idempotencyKey) }), { headers: calendarJsonHeaders });
        }
        if (body.action === 'readd-preview')
            return NextResponse.json(await readdCalendarExport({ ...common, bindingId: calendarUuid(body.bindingId), sourceKey: calendarString(body.sourceKey, 1024), expectedRevision: calendarString(body.expectedRevision) }), { headers: calendarJsonHeaders });
        if (body.action === 'send') {
            if (!Array.isArray(body.selectedOperationIds) || body.selectedOperationIds.length > 500)
                throw new CalendarExportError('INVALID_SELECTION');
            return NextResponse.json(await sendCalendarExport({ ...common, bindingId: calendarUuid(body.bindingId), reviewId: calendarUuid(body.reviewId), idempotencyKey: calendarUuid(body.idempotencyKey), selectedOperationIds: body.selectedOperationIds.map(calendarUuid) }), { headers: calendarJsonHeaders });
        }
        throw new CalendarExportError('INVALID_REQUEST');
    }
    catch (e) {
        const { code, status } = calendarRouteError(e);
        return NextResponse.json({ code }, { status, headers: calendarJsonHeaders });
    }
}
