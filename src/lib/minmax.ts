/**
 * Generic min/max value tracker with day/month/year/all-time ("absolute") buckets, each
 * remembering both the extreme value and when it occurred. Used to derive
 * `<field>DayMin`/`DayMax`/`MonthMin`/`MonthMax`/`YearMin`/`YearMax`/`AbsoluteMin`/`AbsoluteMax`
 * states (plus a matching `...Time` companion state for each) for the actually measured
 * sensor values, so users don't have to derive these themselves from the history adapter.
 *
 * Buckets automatically "roll over" (reset) once their period (day/month/year) has passed,
 * determined by comparing the bucket's last recorded timestamp against the current date -
 * there is no separate scheduled reset job.
 */

/** A single recorded extreme value and when it occurred */
export interface MinMaxEntry {
    /** The extreme value itself, in whatever unit the tracked field uses */
    value: number;
    /** When this value occurred, as a UNIX timestamp in ms */
    timestamp: number;
}

/** The minimum and maximum recorded for one period (day/month/year/absolute) */
export interface MinMaxPeriod {
    /** The lowest value recorded so far within this period, if any */
    min?: MinMaxEntry;
    /** The highest value recorded so far within this period, if any */
    max?: MinMaxEntry;
}

/** The full set of tracked periods for one field */
export interface MinMaxState {
    /** Bucket covering the current calendar day */
    day: MinMaxPeriod;
    /** Bucket covering the current calendar month */
    month: MinMaxPeriod;
    /** Bucket covering the current calendar year */
    year: MinMaxPeriod;
    /** Bucket covering all time (never rolls over) */
    absolute: MinMaxPeriod;
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameMonth(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isSameYear(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear();
}

/**
 * Updates a single period bucket with a new value, resetting it first if the bucket's
 * existing entries are from a previous period (e.g. a new day/month/year has started).
 *
 * @param period - The bucket's previous state (before this update)
 * @param now - The current date/time, used both as the new entry's timestamp and to detect period rollover
 * @param matchesPeriod - Predicate that decides whether a past timestamp still belongs to the current period
 * @param value - The newly measured value
 * @param timestamp - The UNIX timestamp (ms) of the new value
 * @returns The updated bucket, either extended with the new value or freshly reset
 */
function updatePeriod(
    period: MinMaxPeriod,
    now: Date,
    matchesPeriod: (reference: Date, now: Date) => boolean,
    value: number,
    timestamp: number,
): MinMaxPeriod {
    const referenceEntry = period.min ?? period.max;
    const stillCurrentPeriod = referenceEntry !== undefined && matchesPeriod(new Date(referenceEntry.timestamp), now);
    const base = stillCurrentPeriod ? period : {};

    const min = base.min === undefined || value < base.min.value ? { value, timestamp } : base.min;
    const max = base.max === undefined || value > base.max.value ? { value, timestamp } : base.max;
    return { min, max };
}

/**
 * Records a newly measured value into all four tracked periods (day/month/year/absolute),
 * rolling over any period bucket whose previous entries are no longer current.
 *
 * @param previous - The field's previous tracker state, or `undefined` if this is the first
 *   measurement seen this adapter run (e.g. right after a restart, before any persisted state
 *   has been reloaded)
 * @param value - The newly measured value, in whatever unit the tracked field uses
 * @param now - The current date/time (defaults to `new Date()`)
 * @returns The updated tracker state, with all four periods re-evaluated
 */
export function updateMinMax(previous: MinMaxState | undefined, value: number, now: Date = new Date()): MinMaxState {
    const timestamp = now.getTime();
    return {
        day: updatePeriod(previous?.day ?? {}, now, isSameDay, value, timestamp),
        month: updatePeriod(previous?.month ?? {}, now, isSameMonth, value, timestamp),
        year: updatePeriod(previous?.year ?? {}, now, isSameYear, value, timestamp),
        absolute: updatePeriod(previous?.absolute ?? {}, now, () => true, value, timestamp),
    };
}
