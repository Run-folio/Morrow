import { useEffect, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { MapTransferPreview } from './map-transfer-preview';
import styles from './easyt/morrovia-map-presentation.module.css';
import { mapRouteLegsFromTrip } from '@/lib/easyt/map-spatial-context';
import type { EasyTTrip, TripLeg } from '@/lib/easyt/trip';

function TimingPreview({ state }: { state: 'range' | 'unknown' | 'verified' | 'reference' }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const card = root.current?.querySelector<HTMLElement>('.planner-map__leg-card');
    card?.classList.add('is-visible');
    card?.removeAttribute('aria-hidden');
    if (card) { card.style.left = '12px'; card.style.top = '12px'; }
  }, [state]);
  const fact = (point: number, minimum: number, maximum: number) => ({
    status: state === 'unknown' ? 'unknown' : 'known',
    confidence: state === 'verified' ? 'verified' : 'estimated',
    value: state === 'unknown' ? null : { planningMinutes: point,
      precision: state === 'verified' ? 'verified-point' : 'estimated-range',
      rangeMinutes: state === 'verified' ? null : { minimum, maximum } },
  });
  const leg = { id: 'preview-paris-madrid', fromStopId: 'paris', toStopId: 'madrid',
    mode: state === 'reference' ? 'unknown' : 'flight', distanceKm: 1050,
    headlineMinutes: state === 'reference' ? null : 120,
    doorToDoorMinutes: state === 'reference' ? null : 240,
    durationMinutes: state === 'reference' ? null : 240,
    routeMetadata: state === 'reference' ? {} : { transferImpact: { version: 1, mode: 'flight', headline: fact(120, 100, 140), doorToDoor: fact(240, 210, 270) } },
    ...(state === 'reference' ? { roadEstimate: { durationMinutes: 825, distanceKm: 1200, routeGeometry: [], warnings: [], attribution: 'Synthetic routing reference' } } : {}),
  } as TripLeg;
  const stops = [{ id: 'paris', name: 'Paris', country: 'France', latitude: 48.85, longitude: 2.35 }, { id: 'madrid', name: 'Madrid', country: 'Spain', latitude: 40.42, longitude: -3.7 }] as EasyTTrip['stops'];
  return <div ref={root} className={styles.surface} style={{ position: 'relative', width: 'min(100%, 360px)', height: 240 }}><MapTransferPreview leg={mapRouteLegsFromTrip({ stops, legs: [leg] })[0]!} /></div>;
}
const meta = { title: 'Morrovia/05 Product Patterns/Map transfer timing', component: TimingPreview,
  args: { state: 'range' }, parameters: { layout: 'padded' } } satisfies Meta<typeof TimingPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Range: Story = {};
export const Unknown: Story = { args: { state: 'unknown' } };
export const Verified: Story = { args: { state: 'verified' } };
export const RoadReference: Story = { args: { state: 'reference' } };
