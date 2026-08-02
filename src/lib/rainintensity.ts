/**
 * Maps a measured rain rate to a rain intensity category, using the widely used WMO/NWS
 * intensity thresholds (mm/h) that most weather services also use for their "precipitation
 * intensity" classification.
 */

export type RainIntensityLevel = 'none' | 'light' | 'moderate' | 'heavy' | 'veryHeavy';

/** German display labels for each rain intensity category, keyed by the machine-readable identifier */
export const RAIN_INTENSITY_LEVEL_LABEL_DE: Record<RainIntensityLevel, string> = {
    none: 'Kein Niederschlag',
    light: 'Leicht',
    moderate: 'Mäßig',
    heavy: 'Stark',
    veryHeavy: 'Sehr stark',
};

/** Below this rain rate (mm/h), there is effectively no measurable precipitation */
const NONE_MAX_MMH = 0;
/** Below this rain rate (mm/h), precipitation is classified as light */
const LIGHT_MAX_MMH = 2.5;
/** Below this rain rate (mm/h), precipitation is classified as moderate */
const MODERATE_MAX_MMH = 7.6;
/** Below this rain rate (mm/h), precipitation is classified as heavy; at/above it, as very heavy */
const HEAVY_MAX_MMH = 50;

/**
 * Determines the WMO/NWS-inspired rain intensity category for a measured rain rate.
 *
 * @param rainRateMmh - Current rain rate in mm/h
 * @returns The corresponding intensity category identifier
 */
export function getRainIntensityLevel(rainRateMmh: number): RainIntensityLevel {
    if (rainRateMmh <= NONE_MAX_MMH) {
        return 'none';
    }
    if (rainRateMmh <= LIGHT_MAX_MMH) {
        return 'light';
    }
    if (rainRateMmh <= MODERATE_MAX_MMH) {
        return 'moderate';
    }
    if (rainRateMmh <= HEAVY_MAX_MMH) {
        return 'heavy';
    }
    return 'veryHeavy';
}

/**
 * Determines the German display label for the rain intensity category of a measured rain rate.
 *
 * @param rainRateMmh - Current rain rate in mm/h
 * @returns The German intensity category label, e.g. "Mäßig"
 */
export function getRainIntensityLevelLabel(rainRateMmh: number): string {
    return RAIN_INTENSITY_LEVEL_LABEL_DE[getRainIntensityLevel(rainRateMmh)];
}
