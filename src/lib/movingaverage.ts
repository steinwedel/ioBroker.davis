/**
 * A simple time-windowed moving average, used to smooth out short-lived
 * fluctuations - e.g. a single small cloud passing in front of the sun for
 * less than a minute - before a sensor reading is used for the solar-based
 * cloud cover calculation. Without this, a single momentary dip in solar
 * radiation can swing the cloud cover estimate by tens of percentage points
 * even though the overall sky condition has not actually changed.
 */

/** A single timestamped sample used for a moving average */
export interface TimedSample {
    /** The sampled value */
    value: number;
    /** When this sample was taken (ms since epoch) */
    timestamp: number;
}

/**
 * Adds a new sample to a list, discarding samples older than the given window,
 * and returns both the updated (pruned) sample list and the resulting average.
 *
 * @param samples - Existing samples, in any order
 * @param value - The new sample's value
 * @param timestamp - The new sample's timestamp (ms since epoch)
 * @param windowMs - How far back in time samples are kept before being discarded
 * @returns The pruned sample list (including the new sample) and the average of all samples within the window
 */
export function addSample(
    samples: TimedSample[],
    value: number,
    timestamp: number,
    windowMs: number,
): { samples: TimedSample[]; average: number } {
    const cutoff = timestamp - windowMs;
    const pruned = samples.filter(s => s.timestamp >= cutoff);
    pruned.push({ value, timestamp });

    const sum = pruned.reduce((acc, s) => acc + s.value, 0);
    return { samples: pruned, average: sum / pruned.length };
}
