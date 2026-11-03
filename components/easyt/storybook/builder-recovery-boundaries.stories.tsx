import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { EasyTButton } from '../easyt-controls';
import { MorroviaRecoveryFeedback, MorroviaSaveStatus } from '../morrovia-feedback';
import { cancunReturnTripFixture } from './cancun-return-trip.fixture';
import { createQuotaRefusedRetryFixture, createCompletedCreationContinuationFixture } from './builder-recovery-fixtures';
import styles from '../morrovia-feedback.stories.module.css';
import catalogue from './morrovia-storybook-catalogue.module.css';

type QuotaFixture = Awaited<ReturnType<typeof createQuotaRefusedRetryFixture>>;
type CreationFixture = Awaited<ReturnType<typeof createCompletedCreationContinuationFixture>>;
type OpenedCreation = Awaited<ReturnType<CreationFixture['open']>>;

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return <main className={`${styles.page} morrovia-editorial-page`}>
    <section className={styles.focusPage}>
      <h1>{title}</h1>
      {children}
    </section>
  </main>;
}

function QuotaBoundary() {
  const [fixture, setFixture] = useState<QuotaFixture | null>(null);
  const [snapshot, setSnapshot] = useState<ReturnType<QuotaFixture['session']['getSnapshot']> | null>(null);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    let active = true, owned: QuotaFixture | undefined, unsubscribe: (() => void) | undefined;
    void createQuotaRefusedRetryFixture(cancunReturnTripFixture).then(next => {
      owned = next;
      if (!active) { next.dispose(); return; }
      setFixture(next);
      setSnapshot(next.session.getSnapshot());
      unsubscribe = next.session.subscribe(() => { if (active) setSnapshot(next.session.getSnapshot()); });
    }).catch(error => { if (active) setFailure(String(error)); });
    return () => { active = false; unsubscribe?.(); owned?.dispose(); };
  }, []);
  return <Frame title="Retry a change">
    <p className={styles.intro}>Production controller and shared feedback at the native recovery boundary. Synthetic memory storage; account sync, overflow and full Builder integration are outside this fixture.</p>
    {failure ? <p role="alert">{failure}</p> : !fixture || !snapshot ? <MorroviaSaveStatus state="saving" label="Preparing synthetic recovery…" /> : <>
      <div className={catalogue.record}>
        <dl>
          <div><dt>Accepted budget</dt><dd><output aria-label="Accepted budget">{snapshot.trip.brief.budgetBand}</output></dd></div>
          <div><dt>Recovery budget</dt><dd><output aria-label="Recovery budget">{fixture.recovery()?.trip.brief.budgetBand}</output></dd></div>
          <div><dt>Accepted changes</dt><dd><output aria-label="Accepted changes">{snapshot.acceptedRevision}</output></dd></div>
          {snapshot.error?.retryableEdit ? <div><dt>Source bytes</dt><dd><output aria-label="Refused source preserved">{fixture.sourcePreserved() ? 'Unchanged' : 'Changed'}</output></dd></div> : null}
        </dl>
      </div>
      <div className={styles.builderRecovery}>
        {snapshot.error ? <MorroviaRecoveryFeedback
          title="Change not saved"
          detail={snapshot.error.message}
          safety="This change is held only in this tab until it can be saved."
          actions={<EasyTButton variant="secondary" disabled={snapshot.error.retryingEdit} onClick={() => { void fixture.session.retryRejectedEdit(); }}>Retry this change</EasyTButton>}
        /> : <MorroviaSaveStatus state="device" label="Saved on this device" />}
      </div>
    </>}
  </Frame>;
}

function CompletedCreationBoundary() {
  const liveFixture = useRef<CreationFixture | null>(null);
  const [fixture, setFixture] = useState<CreationFixture | null>(null);
  const [opened, setOpened] = useState<OpenedCreation | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true, owned: CreationFixture | undefined;
    void createCompletedCreationContinuationFixture(cancunReturnTripFixture).then(async next => {
      owned = next;
      if (!active) { next.dispose(); return; }
      const result = await next.open();
      if (active) { liveFixture.current = next; setFixture(next); setOpened(result); setOpenCount(1); }
    }).catch(error => { if (active) setFailure(String(error)); });
    return () => { active = false; if (liveFixture.current === owned) liveFixture.current = null; owned?.dispose(); };
  }, []);
  const reopen = async () => {
    if (!fixture || busy) return;
    setBusy(true);
    try {
      const result = await fixture.open();
      if (liveFixture.current === fixture) { setOpened(result); setOpenCount(count => count + 1); }
    } catch (error) { if (liveFixture.current === fixture) setFailure(String(error)); }
    finally { if (liveFixture.current === fixture) setBusy(false); }
  };
  return <Frame title="Continue a created trip">
    <p className={styles.intro}>Production creation proof, broker and cold entry controller with synthetic memory storage. The completed reservation locates the later document without replaying the original creation.</p>
    {failure ? <p role="alert">{failure}</p> : !opened ? <MorroviaSaveStatus state="saving" label="Opening synthetic recovery…" /> : <>
      <div className={catalogue.record}>
        <h2>{opened.seed.initialTrip.title}</h2>
        <dl>
          <div><dt>Recovery write</dt><dd><output aria-label="Opened recovery write">{opened.seed.initialRecovery?.writeId}</output></dd></div>
          <div><dt>Creation replay</dt><dd><output aria-label="Creation replay">{opened.pendingCreation === null ? 'Not armed' : 'Pending'}</output></dd></div>
          <div><dt>Source bytes</dt><dd><output aria-label="Creation source preserved">{opened.sourcePreserved ? 'Unchanged' : 'Changed'}</output></dd></div>
          <div><dt>Cold opens</dt><dd><output aria-label="Cold opens">{openCount}</output></dd></div>
        </dl>
      </div>
      <div className={styles.builderFooter}>
        <MorroviaSaveStatus state="device" label="Saved on this device" />
        <EasyTButton variant="secondary" disabled={busy} onClick={() => { void reopen(); }}>Open saved trip again</EasyTButton>
      </div>
    </>}
  </Frame>;
}

const meta = {
  title: 'Morrovia/05 Product Patterns/Builder recovery boundaries',
  tags: ['current-ui'],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' }, docs: { description: { component: 'Bounded production-controller and shared-feedback fixtures. Memory persistence models the contract; these stories do not establish native durability, overflow policy, full Builder integration or account-save acceptance.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const QuotaRefused: Story = {
  render: () => <QuotaBoundary />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Retry this change' })).toBeEnabled();
    await expect(canvas.getByRole('alert')).toBeVisible();
    await expect(canvas.getByLabelText('Accepted budget')).toHaveTextContent('mid');
    await expect(canvas.getByLabelText('Recovery budget')).toHaveTextContent('mid');
    await expect(canvas.getByLabelText('Refused source preserved')).toHaveTextContent('Unchanged');
    await expect(canvas.getByLabelText('Accepted changes')).toHaveTextContent('0');
  },
};

export const QuotaRefusedRetry: Story = {
  render: () => <QuotaBoundary />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: 'Retry this change' });
    await expect(canvas.getByLabelText('Accepted budget')).toHaveTextContent('mid');
    await expect(canvas.getByLabelText('Recovery budget')).toHaveTextContent('mid');
    await expect(canvas.getByLabelText('Refused source preserved')).toHaveTextContent('Unchanged');
    await expect(canvas.getByLabelText('Accepted changes')).toHaveTextContent('0');
    await userEvent.click(canvas.getByRole('button', { name: 'Retry this change' }));
    await waitFor(() => expect(canvas.getByLabelText('Accepted budget')).toHaveTextContent('high'));
    await expect(canvas.getByLabelText('Recovery budget')).toHaveTextContent('high');
    await expect(canvas.getByLabelText('Accepted changes')).toHaveTextContent('1');
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(canvas.getByText('Saved on this device')).toBeInTheDocument();
  },
};

export const CompletedCreationContinuation: Story = {
  render: () => <CompletedCreationBoundary />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { name: 'Synthetic later traveller edit' });
    await expect(canvas.getByLabelText('Opened recovery write')).toHaveTextContent('synthetic-later-edit');
    await expect(canvas.getByLabelText('Creation replay')).toHaveTextContent('Not armed');
    await expect(canvas.getByLabelText('Creation source preserved')).toHaveTextContent('Unchanged');
    await userEvent.click(canvas.getByRole('button', { name: 'Open saved trip again' }));
    await waitFor(() => expect(canvas.getByLabelText('Cold opens')).toHaveTextContent('2'));
    await expect(canvas.getByRole('heading', { name: 'Synthetic later traveller edit' })).toBeInTheDocument();
    await expect(canvas.getByLabelText('Creation source preserved')).toHaveTextContent('Unchanged');
    await expect(canvas.getByLabelText('Creation replay')).toHaveTextContent('Not armed');
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};
