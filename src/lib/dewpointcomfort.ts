/**
 * Maps a measured dew point to a common "mugginess"/comfort category, using the widely cited
 * NOAA dew point comfort scale (dew point in °C, converted from the original °F thresholds).
 */

export type DewPointComfortLevel = 'dry' | 'comfortable' | 'humid' | 'oppressive';

/** German display labels for each comfort category, keyed by the machine-readable identifier */
export const DEW_POINT_COMFORT_LEVEL_LABEL_DE: Record<DewPointComfortLevel, string> = {
    dry: 'Trocken',
    comfortable: 'Angenehm',
    humid: 'Schwül',
    oppressive: 'Sehr schwül',
};

/** Below this dew point (°C, converted from the NOAA 55°F "dry" threshold), the air feels dry */
const COMFORTABLE_MIN_C = 12.8;
/** At/above this dew point (°C, converted from the NOAA 65°F "getting sticky" threshold), the air starts feeling humid/muggy */
const HUMID_MIN_C = 18.3;
/** At/above this dew point (°C, converted from the NOAA 75°F "extremely uncomfortable" threshold), the air feels oppressive */
const OPPRESSIVE_MIN_C = 23.9;

/**
 * Determines the NOAA-inspired dew point comfort category for a measured dew point.
 *
 * @param dewPointC - Current dew point in °C
 * @returns The corresponding comfort category identifier
 */
export function getDewPointComfortLevel(dewPointC: number): DewPointComfortLevel {
    if (dewPointC >= OPPRESSIVE_MIN_C) {
        return 'oppressive';
    }
    if (dewPointC >= HUMID_MIN_C) {
        return 'humid';
    }
    if (dewPointC >= COMFORTABLE_MIN_C) {
        return 'comfortable';
    }
    return 'dry';
}

/**
 * Determines the German display label for the dew point comfort category of a measured dew point.
 *
 * @param dewPointC - Current dew point in °C
 * @returns The German comfort category label, e.g. "Schwül"
 */
export function getDewPointComfortLevelLabel(dewPointC: number): string {
    return DEW_POINT_COMFORT_LEVEL_LABEL_DE[getDewPointComfortLevel(dewPointC)];
}
