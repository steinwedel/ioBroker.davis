/**
 * Frost risk detection from the current outside temperature.
 */

/** At/below this temperature (°C), frost/ice formation is considered possible */
const FROST_RISK_MAX_TEMP_C = 0;

/**
 * Determines whether the current temperature indicates a frost risk.
 *
 * @param tempC - Current outside temperature in °C
 * @returns `true` if the temperature is at or below the frost risk threshold
 */
export function isFrostRisk(tempC: number): boolean {
    return tempC <= FROST_RISK_MAX_TEMP_C;
}
