/**
 * Maps a measured UV index value to its WHO/WMO UV risk category, matching the categories
 * used by most weather services (German labels, since this adapter's other derived text
 * states - e.g. `windDirLastText` - use German terms as well).
 */

export type UvRiskLevel = 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme';

/** German display labels for each UV risk category, keyed by the machine-readable identifier */
export const UV_RISK_LEVEL_LABEL_DE: Record<UvRiskLevel, string> = {
    low: 'Niedrig',
    moderate: 'Mäßig',
    high: 'Hoch',
    veryHigh: 'Sehr hoch',
    extreme: 'Extrem',
};

/**
 * Determines the WHO/WMO UV risk category for a measured UV index.
 *
 * @param uvIndex - The current UV index reading (typically 0-11+)
 * @returns The corresponding risk category identifier
 */
export function getUvRiskLevel(uvIndex: number): UvRiskLevel {
    if (uvIndex <= 2) {
        return 'low';
    }
    if (uvIndex <= 5) {
        return 'moderate';
    }
    if (uvIndex <= 7) {
        return 'high';
    }
    if (uvIndex <= 10) {
        return 'veryHigh';
    }
    return 'extreme';
}

/**
 * Determines the German display label for the WHO/WMO UV risk category of a measured UV index.
 *
 * @param uvIndex - The current UV index reading (typically 0-11+)
 * @returns The German risk category label, e.g. "Mäßig"
 */
export function getUvRiskLevelLabel(uvIndex: number): string {
    return UV_RISK_LEVEL_LABEL_DE[getUvRiskLevel(uvIndex)];
}
