// Log screen — quick-add forms. Mirrors every Telegram command with a tap-first UI.
// Each form is its own server action, so partial submits don't blow away other entries.

import { Card, CardLabel } from '@/components/Card';
import { Header } from '@/components/Header';
import Link from 'next/link';
import {
  logProtein, logSteps, logSleep, logNutrition,
  logWaist, logWeight, logDrinks, logWorkout, logCheat,
} from './actions';

export const dynamic = 'force-dynamic';

export default function LogPage() {
  return (
    <>
      <Header today={new Date()} />

      <main className="space-y-3 px-3 pb-6">
        <Card>
          <CardLabel>Protein anchor</CardLabel>
          <form action={logProtein} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <NumberInput name="grams" placeholder="Grams" min={10} step={1} />
            <NumberInput name="minutes_after_wake" placeholder="Min after wake" min={0} step={5} />
            <SubmitButton>Log</SubmitButton>
          </form>
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <CardLabel>Nutrition compliance</CardLabel>
            <Link
              href="/log/scan"
              className="text-[12px] font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
            >
              Scan barcode
            </Link>
          </div>
          <form action={logNutrition} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <RadioTile name="compliance" value="fully_compliant" label="Fully" />
              <RadioTile name="compliance" value="mostly_compliant" label="Mostly" />
              <RadioTile name="compliance" value="off_plan_recovered" label="Recovered" />
              <RadioTile name="compliance" value="off_plan" label="Off plan" />
            </div>
            <SubmitButton full>Log compliance</SubmitButton>
          </form>
        </Card>

        <Card>
          <CardLabel>Steps</CardLabel>
          <form action={logSteps} className="grid grid-cols-[1fr_auto] gap-2">
            <NumberInput name="steps_total" placeholder="Total steps today" min={0} step={100} />
            <SubmitButton>Log</SubmitButton>
          </form>
        </Card>

        <Card>
          <CardLabel>Sleep</CardLabel>
          <form action={logSleep} className="grid grid-cols-[1fr_auto] gap-2">
            <NumberInput name="sleep_minutes" placeholder="Minutes last night" min={0} step={15} />
            <SubmitButton>Log</SubmitButton>
          </form>
        </Card>

        <Card>
          <CardLabel>Waist (Friday)</CardLabel>
          <form action={logWaist} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <NumberInput name="reading_1" placeholder="Reading 1 (in)" step={0.25} />
            <NumberInput name="reading_2" placeholder="Reading 2 (in)" step={0.25} />
            <SubmitButton>Log</SubmitButton>
          </form>
          <p className="mt-2 text-[12px] text-zinc-500">
            Navel level, relaxed, after normal exhale. Both readings stored; average is computed.
          </p>
        </Card>

        <Card>
          <CardLabel>Weight</CardLabel>
          <form action={logWeight} className="grid grid-cols-[1fr_auto] gap-2">
            <NumberInput name="weight_lbs" placeholder="Pounds" step={0.1} />
            <SubmitButton>Log</SubmitButton>
          </form>
        </Card>

        <Card>
          <CardLabel>Alcohol</CardLabel>
          <form action={logDrinks} className="grid grid-cols-[auto_1fr_auto] gap-2">
            <NumberInput name="drinks" placeholder="#" min={0.5} step={0.5} className="w-16" />
            <TextInput name="note" placeholder="Context (optional)" />
            <SubmitButton>Log</SubmitButton>
          </form>
        </Card>

        <Card>
          <CardLabel>Workout</CardLabel>
          <form action={logWorkout} className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <RadioTile name="outcome" value="done" label="Done" />
              <RadioTile name="outcome" value="rehab" label="Rehab" />
              <RadioTile name="outcome" value="skip" label="Skip" />
            </div>
            <SubmitButton full>Log workout</SubmitButton>
          </form>
        </Card>

        <Card>
          <CardLabel>Cheat day</CardLabel>
          <form action={logCheat} className="grid grid-cols-2 gap-2">
            <button
              type="submit" name="on" value="on"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-[14px] font-medium dark:border-zinc-800 dark:bg-zinc-900"
            >
              Mark cheat on
            </button>
            <button
              type="submit" name="on" value="off"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-[14px] font-medium dark:border-zinc-800 dark:bg-zinc-900"
            >
              Cheat off
            </button>
          </form>
        </Card>
      </main>
    </>
  );
}

function NumberInput(props: {
  name: string; placeholder: string; min?: number; step?: number; className?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      name={props.name}
      placeholder={props.placeholder}
      min={props.min}
      step={props.step}
      className={`rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px] tabular-nums outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600 ${props.className ?? ''}`}
    />
  );
}

function TextInput(props: { name: string; placeholder: string }) {
  return (
    <input
      type="text"
      name={props.name}
      placeholder={props.placeholder}
      className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600"
    />
  );
}

function SubmitButton({ children, full = false }: { children: React.ReactNode; full?: boolean }) {
  return (
    <button
      type="submit"
      className={`rounded-xl bg-zinc-900 px-4 py-2.5 text-[14px] font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  );
}

function RadioTile({ name, value, label }: { name: string; value: string; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[14px] transition has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white dark:border-zinc-800 dark:bg-zinc-900 dark:has-[:checked]:border-zinc-50 dark:has-[:checked]:bg-zinc-50 dark:has-[:checked]:text-zinc-900">
      <input type="radio" name={name} value={value} className="sr-only" />
      {label}
    </label>
  );
}
