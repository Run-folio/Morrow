import { NextResponse } from 'next/server';
import { requireEasyTOwner } from '@/lib/easyt/owner';
import { getMorroviaAuthBaseURL } from '@/lib/easyt/auth-environment';
import { finishCalendarExportConsent } from '@/lib/easyt/calendar-export-auth.server';
export async function GET(request: Request) { const origin = getMorroviaAuthBaseURL(); try {
    const owner = await requireEasyTOwner(), q = new URL(request.url).searchParams;
    const result = await finishCalendarExportConsent(owner.id, q.get('state') ?? '', q.get('code') ?? '');
    const url = new URL(`/journey/${encodeURIComponent(result.tripId)}/itinerary`, origin);
    url.searchParams.set('itineraryView', 'calendar');
    url.searchParams.set('calendarExport', 'connected');
    url.searchParams.set('calendarExportGrant', result.grantId);
    return NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
catch {
    return NextResponse.redirect(new URL('/journey?calendarExport=connection-failed', origin), { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
} }
