/**
 * Cloud cover estimation from Davis WeatherLink Live sensor data.
 *
 * Two independent models are used depending on which sensors are actually
 * present on the station:
 *
 * - Model A ("solar"): compares measured solar radiation against a clear-sky
 *   reference value to derive a clear-sky index, which is then mapped to a
 *   cloud cover percentage. The reference is either a site-learned value
 *   (see `clearskyreference.ts`, preferred once enough data has been
 *   collected) or, until then, a generic theoretical clear-sky value
 *   (Haurwitz model). Requires a solar radiation sensor and a sun elevation
 *   above a minimum threshold (i.e. daytime only).
 * - Model B ("heuristic" / "heuristic+pressure"): a much rougher fallback
 *   based on the dew point depression (temperature - dew point), optionally
 *   refined with the barometric pressure trend if a barometer is present.
 *   Works day and night, but is only a rough trend indicator, not a
 *   physically grounded measurement.
 */

export type CloudCoverModel = 'solar' | 'heuristic' | 'heuristic+pressure';

/** The result of a cloud cover estimation, including which model produced it */
export interface CloudCoverResult {
    /** Estimated cloud cover in percent (0-100) */
    percent: number;
    /** Which model produced this estimate */
    model: CloudCoverModel;
}

/** Below this sun elevation, the solar model becomes unreliable (dawn/dusk/horizon effects) */
const MIN_SOLAR_ELEVATION_DEG = 3;

/**
 * Computes the theoretical clear-sky global horizontal irradiance for a given
 * sun elevation, using the Haurwitz model. Requires no atmospheric turbidity
 * data, making it robust (if approximate) without site-specific calibration.
 *
 * @param elevationDeg - Sun elevation angle in degrees above the horizon
 * @returns Clear-sky irradiance in W/m², or 0 if the sun is below the horizon
 */
function clearSkyIrradiance(elevationDeg: number): number {
    if (elevationDeg <= 0) {
        return 0;
    }
    const zenithRad = ((90 - elevationDeg) * Math.PI) / 180;
    const cosZenith = Math.cos(zenithRad);
    if (cosZenith <= 0) {
        return 0;
    }
    return 1098 * cosZenith * Math.exp(-0.059 / cosZenith);
}

/**
 * Model A: estimates cloud cover from measured solar radiation and the current sun elevation.
 *
 * @param solarRadWm2 - Measured solar radiation in W/m²
 * @param elevationDeg - Current sun elevation angle in degrees
 * @param learnedClearSky - Optional site-learned clear-sky reference (W/m²) for this elevation,
 *   e.g. from `clearskyreference.ts`. When available, it is used instead of the generic Haurwitz
 *   formula, since it reflects this station's actual local atmospheric conditions rather than an
 *   idealized reference atmosphere.
 * @returns Cloud cover in percent (0-100), or `undefined` if the sun is too low for a reliable estimate
 */
export function computeCloudCoverSolar(
    solarRadWm2: number,
    elevationDeg: number,
    learnedClearSky?: number,
): number | undefined {
    if (elevationDeg < MIN_SOLAR_ELEVATION_DEG) {
        return undefined;
    }
    const clearSky =
        learnedClearSky !== undefined && learnedClearSky > 0 ? learnedClearSky : clearSkyIrradiance(elevationDeg);
    if (clearSky <= 0) {
        return undefined;
    }

    // Clear-sky index: ratio of measured to theoretical clear-sky irradiance,
    // clamped to allow for sensor noise/calibration slightly above the ideal curve.
    const kt = Math.min(1.2, Math.max(0, solarRadWm2 / clearSky));

    // Piecewise-linear mapping from clear-sky index to cloud cover percentage:
    // kt >= 0.8 -> 0% (clear), kt <= 0.2 -> 100% (overcast), linear in between.
    if (kt >= 0.8) {
        return 0;
    }
    if (kt <= 0.2) {
        return 100;
    }
    return Math.round(100 * (1 - (kt - 0.2) / 0.6));
}

/** Dew point depression (°C) at/below which the sky is assumed fully overcast/foggy */
const DEPRESSION_OVERCAST_C = 1;
/** Dew point depression (°C) at/above which the sky is assumed clear */
const DEPRESSION_CLEAR_C = 12;
/** Cloud cover adjustment (percentage points) per hPa/3h of barometric trend */
const PRESSURE_TREND_FACTOR = 5;
/** Maximum adjustment magnitude applied from the pressure trend correction */
const MAX_PRESSURE_ADJUSTMENT = 15;

/**
 * Model B: rough fallback cloud cover estimate based on the dew point depression,
 * optionally refined with the barometric pressure trend. Used when no solar
 * radiation sensor is present, or when the sun is too low for Model A (night/dawn/dusk).
 *
 * This is a heuristic trend indicator, not a physically grounded measurement -
 * near-saturation conditions (fog, low cloud) and dry conditions (clear sky) are
 * fairly reliable, but the mapping between is only a rough approximation.
 *
 * @param tempC - Current temperature in °C
 * @param dewPointC - Current dew point in °C
 * @param barTrendHpa - Optional 3-hour barometric pressure trend in hPa (negative = falling)
 * @returns The estimated cloud cover and which variant of the model was used
 */
export function computeCloudCoverHeuristic(tempC: number, dewPointC: number, barTrendHpa?: number): CloudCoverResult {
    const depression = Math.max(0, tempC - dewPointC);

    let percent: number;
    if (depression <= DEPRESSION_OVERCAST_C) {
        percent = 100;
    } else if (depression >= DEPRESSION_CLEAR_C) {
        percent = 0;
    } else {
        const range = DEPRESSION_CLEAR_C - DEPRESSION_OVERCAST_C;
        percent = 100 * (1 - (depression - DEPRESSION_OVERCAST_C) / range);
    }

    if (barTrendHpa === undefined || barTrendHpa === null) {
        return { percent: Math.round(percent), model: 'heuristic' };
    }

    // Falling pressure (negative trend) nudges the estimate towards more cloud cover,
    // rising pressure (positive trend) nudges it towards clearer skies.
    const adjustment = Math.min(
        MAX_PRESSURE_ADJUSTMENT,
        Math.max(-MAX_PRESSURE_ADJUSTMENT, -barTrendHpa * PRESSURE_TREND_FACTOR),
    );
    percent = Math.min(100, Math.max(0, percent + adjustment));

    return { percent: Math.round(percent), model: 'heuristic+pressure' };
}
