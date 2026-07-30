/**
 * Converts a wind direction in degrees to a 16-point compass direction abbreviation
 * (German convention, using "O" for Ost/East instead of the English "E"), matching
 * the convention commonly used in German weather station scripts/dashboards.
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
