/**
 * Adaptive, site-specific clear-sky reference for the solar-radiation-based cloud cover
 * model (see `cloudcover.ts`). The generic Haurwitz clear-sky formula is a reasonable
 * starting point, but it does not account for local atmospheric turbidity, humidity or
 * altitude, and can systematically over- or underestimate the irradiance that is actually
 * achievable on a genuinely clear day at a given site. This module lets the adapter learn,
 * per sun-elevation bucket, the highest solar radiation actually observed over a rolling
 * window - which then serves as a much more realistic "what does clear sky look like here"
 * reference than the generic formula alone.
 */

/** Width of each sun-elevation bucket in degrees (coarser buckets need less time to fill, finer buckets are more precise) */
export const ELEVATION_BUCKET_SIZE_DEG = 5;
/** How long a learned maximum stays fully valid before it starts decaying */
const ROLLING_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
/** Daily multiplicative decay applied to a learned maximum once it is older than the rolling window */
const DECAY_PER_DAY = 0.99;

/** A learned clear-sky solar radiation maximum for one sun-elevation bucket */
export interface ClearSkyReferenceEntry {
    /** Highest solar radiation (W/m²) observed in this elevation bucket */
    maxValue: number;
    /** When this maximum was last observed/updated (ms since epoch) */
    timestamp: number;
}

export type ClearSkyReferenceMap = Record<string, ClearSkyReferenceEntry>;

/**
 * Maps a sun elevation angle to its bucket key.
 *
 * @param elevationDeg - Sun elevation angle in degrees
 * @returns The bucket key, e.g. "25" for angles between 25° and 30°
 */
function getBucketKey(elevationDeg: number): string {
    const bucket = Math.max(0, Math.floor(elevationDeg / ELEVATION_BUCKET_SIZE_DEG) * ELEVATION_BUCKET_SIZE_DEG);
    return String(bucket);
}

/**
 * Records a new solar radiation observation, updating the learned reference for the
 * matching elevation bucket if this observation is a new (decayed-adjusted) maximum.
 * Returns a new map; the input map is not mutated.
 *
 * @param map - The current learned reference map (e.g. loaded from a persisted state)
 * @param elevationDeg - Sun elevation angle in degrees for this observation
 * @param solarRadWm2 - Measured solar radiation in W/m² for this observation
 * @param now - Current time in ms since epoch (injectable for testing)
 * @returns The updated reference map
 */
export function recordObservation(
    map: ClearSkyReferenceMap,
    elevationDeg: number,
    solarRadWm2: number,
    now: number,
): ClearSkyReferenceMap {
    const key = getBucketKey(elevationDeg);
    const existing = map[key];
    const effectiveMax = existing ? decayedValue(existing, now) : 0;

    if (solarRadWm2 > effectiveMax) {
        return { ...map, [key]: { maxValue: solarRadWm2, timestamp: now } };
    }
    return map;
}

/**
 * Returns the learned clear-sky reference for a given elevation angle, if any observation
 * has been recorded for its bucket yet. The returned value is decayed based on age, so a
 * maximum that has not been challenged in a long time gradually loses influence rather
 * than being trusted indefinitely.
 *
 * @param map - The current learned reference map
 * @param elevationDeg - Sun elevation angle in degrees to look up
 * @param now - Current time in ms since epoch (injectable for testing)
 * @returns The learned clear-sky irradiance in W/m², or `undefined` if this bucket has no data yet
 */
export function getReference(map: ClearSkyReferenceMap, elevationDeg: number, now: number): number | undefined {
    const entry = map[getBucketKey(elevationDeg)];
    if (!entry) {
        return undefined;
    }
    return decayedValue(entry, now);
}

/**
 * Applies age-based decay to a learned maximum: full value within the rolling window,
 * then a gradual daily decay afterwards so stale/anomalous values fade out over time.
 *
 * @param entry - The stored reference entry
 * @param now - Current time in ms since epoch
 * @returns The (possibly decayed) reference value
 */
function decayedValue(entry: ClearSkyReferenceEntry, now: number): number {
    const ageMs = now - entry.timestamp;
    if (ageMs <= ROLLING_WINDOW_MS) {
        return entry.maxValue;
    }
    const overdueDays = (ageMs - ROLLING_WINDOW_MS) / (24 * 60 * 60 * 1000);
    return entry.maxValue * Math.pow(DECAY_PER_DAY, overdueDays);
}
