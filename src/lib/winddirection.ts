/**
 * Converts a wind direction in degrees to a 16-point compass direction abbreviation
 * (German convention, using "O" for Ost/East instead of the English "E"), matching
 * the convention commonly used in German weather station scripts/dashboards.
 *
 * Also provides `computeDirectionSpread()`, which determines the "opening angle" (angular
 * range) spanned by a set of recent wind direction readings - a simple, continuously
 * updated indicator of how variable/gusty the wind direction currently is.
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
 * Determines the "opening angle" (angular range/spread) spanned by a set of wind direction
 * readings, i.e. the size of the smallest arc that contains all of them. This is the standard
 * way to measure directional variability for a circular quantity like wind direction, where a
 * naive max-min would give wrong results across the 0°/360° wrap-around (e.g. readings of 350°
 * and 10° are only 20° apart, not 340°).
 *
 * The result is recomputed from scratch on every call from whichever readings are currently in
 * the caller's rolling time window (see `movingaverage.ts`'s `addSample()`), so it continuously
 * reflects only the last N minutes of readings rather than only becoming available once a full
 * window has elapsed - with a single reading, or once enough readings accumulate, it can be
 * computed immediately.
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

    // The smallest enclosing arc is 360° minus the largest gap between consecutive readings
    // (sorted around the circle, including the wrap-around gap from the last back to the first).
    let largestGap = 0;
    for (let i = 0; i < normalized.length; i++) {
        const current = normalized[i];
        const next = normalized[(i + 1) % normalized.length];
        const gap = i === normalized.length - 1 ? 360 - current + next : next - current;
        largestGap = Math.max(largestGap, gap);
    }
    return 360 - largestGap;
}
