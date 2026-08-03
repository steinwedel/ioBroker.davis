/**
 * Converts a wind direction in degrees to a 16-point compass direction abbreviation
 * (German convention, using "O" for Ost/East instead of the English "E"), matching
 * the convention commonly used in German weather station scripts/dashboards.
 *
 * Also provides `computeDirectionRange()`/`computeDirectionSpread()`, which determine the
 * smallest arc ("opening angle") spanning a set of recent wind direction readings - a simple,
 * continuously updated indicator of how variable/gusty the wind direction currently is.
 */

const COMPASS_DIRECTIONS_DE = [
    'N',
    'NNO',
    'NO',
    'ONO',
    'O',
    'OSO',
    'SO',
    'SSO',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
    'N',
];

/**
 * Converts a wind direction in degrees (0-360) to its 16-point compass abbreviation.
 *
 * @param degrees - Wind direction in degrees, where 0/360 = North, 90 = East, etc.
 * @returns The compass abbreviation, e.g. "N", "NNO", "O", ...
 */
export function getCompassDirection(degrees: number): string {
    const normalized = ((degrees % 360) + 360) % 360;
    const index = Math.floor((normalized + 11.25) / 22.5);
    return COMPASS_DIRECTIONS_DE[index];
}

/**
 * Below this wind speed, in the WeatherLink Live's native mph unit (not the adapter's display
 * unit - see `units.ts`), a wind vane's direction reading is considered too unreliable to use.
 * At (near-)calm wind, the vane can rest at an arbitrary/mechanical position and the reported
 * direction becomes essentially noise rather than a meaningful measurement; including such
 * readings in direction-variability tracking (see `computeDirectionRange()`) can make the
 * detected range balloon out to cover a spurious near-0° reading that doesn't reflect any real
 * directional change.
 */
export const CALM_WIND_SPEED_MPH = 1;

/**
 * Determines whether a wind speed reading is calm enough that its accompanying direction
 * reading should be treated as unreliable noise (see `CALM_WIND_SPEED_MPH`).
 *
 * @param windSpeedMph - Wind speed in the WeatherLink Live's native mph unit (not the display unit)
 * @returns `true` if the wind is calm enough that the direction reading is unreliable
 */
export function isCalmWind(windSpeedMph: number): boolean {
    return windSpeedMph < CALM_WIND_SPEED_MPH;
}

/** The two boundary angles of the smallest arc containing a set of wind direction readings */
export interface DirectionRange {
    /** The arc's starting angle in degrees (0-360) - the reading right after the largest gap */
    min: number;
    /** The arc's ending angle in degrees (0-360) - the reading right before the largest gap. Going clockwise from `min` to `max` (wrapping past 360° back to 0° if `max` < `min`) traces the smallest arc containing all readings. */
    max: number;
}

/**
 * Finds the largest gap between consecutive readings on the circle (sorted, including the
 * wrap-around gap from the last reading back to the first), which is the shared building block
 * for both `computeDirectionRange()` and `computeDirectionSpread()`: the smallest arc containing
 * all readings is whatever remains after excluding this largest (empty) gap.
 *
 * @param sortedNormalized - Wind direction readings normalized to 0-360 and sorted ascending, with duplicates removed
 * @returns The index (into `sortedNormalized`) right before the largest gap, and the gap's size in degrees
 */
function findLargestGap(sortedNormalized: number[]): { indexBeforeGap: number; gapSize: number } {
    let indexBeforeGap = 0;
    let gapSize = 0;
    for (let i = 0; i < sortedNormalized.length; i++) {
        const current = sortedNormalized[i];
        const next = sortedNormalized[(i + 1) % sortedNormalized.length];
        const gap = i === sortedNormalized.length - 1 ? 360 - current + next : next - current;
        if (gap > gapSize) {
            gapSize = gap;
            indexBeforeGap = i;
        }
    }
    return { indexBeforeGap, gapSize };
}

/**
 * Determines the smallest arc (its two boundary angles) that contains a set of wind direction
 * readings, i.e. the minimal enclosing arc for a circular quantity. This correctly handles the
 * 0°/360° wrap-around (e.g. readings of 350° and 10° span only a 20° arc from 350° to 10°, not
 * the 340° arc the other way around) - a naive numeric min/max would give the wrong (and much
 * larger) range in that case.
 *
 * The result is recomputed from scratch on every call from whichever readings are currently in
 * the caller's rolling time window (see `movingaverage.ts`'s `addSample()`), so it continuously
 * reflects only the last N minutes of readings rather than only becoming available once a full
 * window has elapsed - with a single reading, or once enough readings accumulate, it can be
 * computed immediately.
 *
 * @param directionsDeg - Wind direction readings in degrees (any order, need not be normalized to 0-360)
 * @returns The arc's boundary angles, or `undefined` if no readings were given
 */
export function computeDirectionRange(directionsDeg: number[]): DirectionRange | undefined {
    if (directionsDeg.length === 0) {
        return undefined;
    }
    const normalized = [...new Set(directionsDeg.map(d => ((d % 360) + 360) % 360))].sort((a, b) => a - b);
    if (normalized.length === 1) {
        return { min: normalized[0], max: normalized[0] };
    }

    const { indexBeforeGap } = findLargestGap(normalized);
    return {
        min: normalized[(indexBeforeGap + 1) % normalized.length],
        max: normalized[indexBeforeGap],
    };
}

/**
 * Determines the "opening angle" (angular range/spread) spanned by a set of wind direction
 * readings, i.e. the size of the smallest arc that contains all of them. See
 * `computeDirectionRange()` for the arc's actual boundary angles instead of just its size.
 *
 * @param directionsDeg - Wind direction readings in degrees (any order, need not be normalized to 0-360)
 * @returns The angular spread in degrees (0-360), or `undefined` if no readings were given
 */
export function computeDirectionSpread(directionsDeg: number[]): number | undefined {
    if (directionsDeg.length === 0) {
        return undefined;
    }
    const normalized = [...new Set(directionsDeg.map(d => ((d % 360) + 360) % 360))].sort((a, b) => a - b);
    if (normalized.length === 1) {
        return 0;
    }

    const { gapSize } = findLargestGap(normalized);
    return 360 - gapSize;
}
