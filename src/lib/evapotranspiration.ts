/**
 * Reference evapotranspiration (ETo) estimation using the Hargreaves-Samani equation
 * (Hargreaves & Samani, 1985), the standard simplified method recommended by FAO-56 when
 * only temperature data is available (no direct measurement of humidity/wind/net radiation
 * is required). It needs the day's minimum and maximum temperature plus the extraterrestrial
 * radiation for the station's latitude and the current day of year - all of which are already
 * available from this adapter's location setting and daily temperature min/max tracking.
 *
 * ETo = 0.0023 * (Tmean + 17.8) * sqrt(Tmax - Tmin) * Ra
 *
 * This is a rough estimate (typically within ~15-20% of the full FAO-56 Penman-Monteith
 * method for daily totals) - it does not account for actual humidity, wind, or cloud cover.
 */

/** Solar constant in MJ/m²/min */
const SOLAR_CONSTANT = 0.082;
/** Converts extraterrestrial radiation (MJ/m²/day) to its equivalent evaporation (mm/day) */
const RADIATION_TO_MM_FACTOR = 0.408;
/** Hargreaves-Samani empirical coefficient */
const HARGREAVES_COEFFICIENT = 0.0023;
/** Hargreaves-Samani empirical temperature offset (°C) */
const HARGREAVES_TEMP_OFFSET_C = 17.8;

/**
 * Computes the day of year (1-366) for a given date, in the date's local calendar.
 *
 * @param date - The date to convert
 * @returns The 1-based day of year
 */
function getDayOfYear(date: Date): number {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const diffMs = date.getTime() - startOfYear.getTime();
    return Math.floor(diffMs / 86_400_000) + 1;
}

/**
 * Computes the extraterrestrial radiation (Ra, MJ/m²/day) for a given latitude and day of
 * year, following the standard FAO-56 astronomical formula. This is a theoretical value (the
 * radiation that would reach the top of the atmosphere), independent of actual cloud cover.
 *
 * @param latitudeDeg - Station latitude in degrees (-90 to 90, negative = southern hemisphere)
 * @param dayOfYear - Day of year (1-366)
 * @returns Extraterrestrial radiation in MJ/m²/day
 */
export function computeExtraterrestrialRadiation(latitudeDeg: number, dayOfYear: number): number {
    const latitudeRad = (latitudeDeg * Math.PI) / 180;
    // Inverse relative distance Earth-Sun
    const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
    // Solar declination
    const declination = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);
    // Sunset hour angle
    const sunsetAngleArg = Math.min(1, Math.max(-1, -Math.tan(latitudeRad) * Math.tan(declination)));
    const sunsetAngle = Math.acos(sunsetAngleArg);

    return (
        ((24 * 60) / Math.PI) *
        SOLAR_CONSTANT *
        dr *
        (sunsetAngle * Math.sin(latitudeRad) * Math.sin(declination) +
            Math.cos(latitudeRad) * Math.cos(declination) * Math.sin(sunsetAngle))
    );
}

/**
 * Estimates the reference evapotranspiration (ETo, mm/day) using the Hargreaves-Samani
 * equation from the day's minimum/maximum temperature and the station's latitude/date.
 *
 * @param tempMinC - Today's minimum temperature so far, in °C
 * @param tempMaxC - Today's maximum temperature so far, in °C
 * @param latitudeDeg - Station latitude in degrees (-90 to 90)
 * @param date - The date to compute the day of year from (defaults to now)
 * @returns Estimated reference evapotranspiration in mm/day, or `undefined` if the
 *   min/max temperatures are physically implausible (max below min)
 */
export function computeEvapotranspiration(
    tempMinC: number,
    tempMaxC: number,
    latitudeDeg: number,
    date: Date = new Date(),
): number | undefined {
    if (tempMaxC < tempMinC) {
        return undefined;
    }
    const tempMean = (tempMinC + tempMaxC) / 2;
    const ra = computeExtraterrestrialRadiation(latitudeDeg, getDayOfYear(date));
    const eto =
        HARGREAVES_COEFFICIENT *
        (tempMean + HARGREAVES_TEMP_OFFSET_C) *
        Math.sqrt(tempMaxC - tempMinC) *
        ra *
        RADIATION_TO_MM_FACTOR;
    return Math.max(0, eto);
}
