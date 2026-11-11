import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { CalendarExportAction, CalendarExportReviewList } from './calendar-export-dialog';
import type { CalendarExportPayload } from '@/lib/easyt/calendar-export';
const payload = (summary: string): CalendarExportPayload => ({ summary, description: 'Synthetic review fixture.', start: { date: '2026-10-28' }, end: { date: '2026-10-29' }, status: 'tentative', visibility: 'private', transparency: 'transparent' });
const meta = { title: 'Morrovia/05 Product Patterns/Calendar export/Review selection', component: CalendarExportReviewList, args: { selected: ['activity'], onSelection: () => { }, operations: [{ id: 'activity', sourceKey: 'activity:visit', action: 'add', payload: payload('Museum visit — Time not set') }, { id: 'transfer', sourceKey: 'transfer:train', action: 'update', payload: payload('Tokyo → Kyoto — Planning estimate') }, { id: 'removal', sourceKey: 'activity:old', action: 'remove', payload: payload('Old visit — Time not set') }] } } satisfies Meta<typeof CalendarExportReviewList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Review: Story = {};
export const Mobile390: Story = { globals: { viewport: { value: 'morrovia390', isRotated: false } } };
export const RemovalOnly: Story = { args: { selected: [], operations: [{ id: 'removed', sourceKey: 'activity:removed', action: 'remove', payload: payload('Removed trip visit — Time not set') }] } };
export const DateOnlyEstimates: Story = { args: { selected: ['estimate'], operations: [{ id: 'estimate', sourceKey: 'transfer:estimate', action: 'add', payload: payload('London → Tokyo — Planning estimate') }] } };

function UnavailableCalendarExport() {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const original = window.fetch;
        const fixtureFetch: typeof fetch = (input, init) => {
            const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
            return url.pathname === '/api/easyt/trips/synthetic-calendar-unavailable/calendar-export'
                ? Promise.resolve(new Response(JSON.stringify({ configured: false }), { headers: { 'Content-Type': 'application/json' } }))
                : original(input, init);
        };
        window.fetch = fixtureFetch;
        setReady(true);
        return () => { if (window.fetch === fixtureFetch) window.fetch = original; };
    }, []);
    return ready ? <CalendarExportAction tripId="synthetic-calendar-unavailable" ownerId="synthetic-owner" savedRevision="synthetic-revision" settled /> : null;
}
export const ExportUnavailable: Story = {
    render: () => <UnavailableCalendarExport />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(await canvas.findByRole('button', { name: 'Add to calendar' }));
        const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Add trip events to Google Calendar' });
        await expect(within(dialog).getByRole('alert')).toHaveTextContent('Calendar export is not available yet.');
        await expect(within(dialog).getByRole('button', { name: 'Close' })).toBeEnabled();
        await expect(within(dialog).queryByRole('button', { name: 'Connect Google' })).not.toBeInTheDocument();
    },
};
export const ExportUnavailableMobile390: Story = { ...ExportUnavailable, globals: { viewport: { value: 'morrovia390', isRotated: false } } };
