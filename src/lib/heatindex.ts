/**
 * Maps a measured heat index to its NWS ("National Weather Service") heat risk category.
 * The NWS thresholds are defined in °F; they are converted here to °C so they can be applied
 * directly to this adapter's internal metric heat index value.
 */

export type HeatRiskLevel = 'none' | 'caution' | 'extremeCaution' | 'danger' | 'extremeDanger';

/** German display labels for each heat risk category, keyed by the machine-readable identifier */
export const HEAT_RISK_LEVEL_LABEL_DE: Record<HeatRiskLevel, string> = {
    none: 'Keine',
    caution: 'Vorsicht',
    extremeCaution: 'Erhöhte Vorsicht',
    danger: 'Gefahr',
    extremeDanger: 'Extreme Gefahr',
};

/** Below this heat index (°C, converted from the NWS 80°F threshold), there is no elevated heat risk */
const CAUTION_MIN_C = 26.7;
/** At/above this heat index (°C, converted from the NWS 90°F threshold), risk escalates to "extreme caution" */
const EXTREME_CAUTION_MIN_C = 32.2;
/** At/above this heat index (°C, converted from the NWS 103°F threshold), risk escalates to "danger" */
const DANGER_MIN_C = 39.4;
/** At/above this heat index (°C, converted from the NWS 124°F threshold), risk escalates to "extreme danger" */
const EXTREME_DANGER_MIN_C = 51.1;

/**
 * Determines the NWS-inspired heat risk category for a measured heat index.
 *
 * @param heatIndexC - Current heat index in °C
 * @returns The corresponding risk category identifier
 */
export function getHeatRiskLevel(heatIndexC: number): HeatRiskLevel {
    if (heatIndexC >= EXTREME_DANGER_MIN_C) {
        return 'extremeDanger';
    }
    if (heatIndexC >= DANGER_MIN_C) {
        return 'danger';
    }
    if (heatIndexC >= EXTREME_CAUTION_MIN_C) {
        return 'extremeCaution';
    }
    if (heatIndexC >= CAUTION_MIN_C) {
        return 'caution';
    }
    return 'none';
}

/**
 * Determines the German display label for the heat risk category of a measured heat index.
 *
 * @param heatIndexC - Current heat index in °C
 * @returns The German risk category label, e.g. "Erhöhte Vorsicht"
 */
export function getHeatRiskLevelLabel(heatIndexC: number): string {
    return HEAT_RISK_LEVEL_LABEL_DE[getHeatRiskLevel(heatIndexC)];
}
