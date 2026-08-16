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
 *   physically grounded measurement. Humidity is not cloud cover: typical
 *   clear mornings in temperate climates have a small depression and must
 *   not be reported as cloudy.
 */

import { ELEVATION_BUCKET_SIZE_DEG } from './clearskyreference';

export type CloudCoverModel = 'solar' | 'heuristic' | 'heuristic+pressure';

/** The result of a cloud cover estimation, including which model produced it */
export interface CloudCoverResult {
    /** Estimated cloud cover in percent (0-100) */
    percent: number;
    /** Which model produced this estimate */
    model: CloudCoverModel;
}

/**
 * Below this sun elevation the solar model is not trustworthy: cosine error, horizon
 * shading and the steep morning/evening GHI ramp make even a clear sky look overcast.
 * Estimates from below this angle must not be published or held overnight.
 */
export const MIN_SOLAR_ELEVATION_DEG = 15;

/** A historical bucket maximum is the best-ever outlier, not a typical clear day */
const LEARNED_MAX_TO_TYPICAL = 0.88;

/** Haurwitz overestimates achievable GHI at many temperate sites; discount until a local max is learned */
const HAURWITZ_SITE_FACTOR = 0.82;

/** Reject clear-sky learning samples that exceed this multiple of Haurwitz (sensor glints) */
export const MAX_PLAUSIBLE_HAURWITZ_FACTOR = 1.35;

/** Clear-sky index at/above which cloud cover is reported as 0% */
const KT_CLEAR = 0.72;

/** Clear-sky index at/below which cloud cover is reported as 100% */
const KT_OVERCAST = 0.2;

/**
 * Computes the theoretical clear-sky global horizontal irradiance for a given
 * sun elevation, using the Haurwitz model. Requires no atmospheric turbidity
 * data, making it robust (if approximate) without site-specific calibration.
 *
 * @param elevationDeg - Sun elevation angle in degrees above the horizon
 * @returns Clear-sky irradiance in W/m², or 0 if the sun is below the horizon
 */
export function clearSkyIrradiance(elevationDeg: number): number {
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
 * Scales a learned bucket maximum down to the current sun elevation.
 * The stored max almost always occurs near the top of its 5° bucket, so using
 * it unscaled at the bottom of the bucket systematically overstates the
 * reference and reports false cloud cover (especially in the morning).
 *
 * @param learnedMaxWm2 - Highest observed irradiance in the elevation bucket
 * @param elevationDeg - Current sun elevation in degrees
 * @returns Reference irradiance scaled to `elevationDeg`
 */
export function scaleLearnedClearSky(learnedMaxWm2: number, elevationDeg: number): number {
    const bucketEndDeg =
        Math.floor(elevationDeg / ELEVATION_BUCKET_SIZE_DEG) * ELEVATION_BUCKET_SIZE_DEG + ELEVATION_BUCKET_SIZE_DEG;
    const haurwitzNow = clearSkyIrradiance(elevationDeg);
    const haurwitzAtBucketEnd = clearSkyIrradiance(bucketEndDeg);
    const scaled = haurwitzAtBucketEnd > 0 ? learnedMaxWm2 * (haurwitzNow / haurwitzAtBucketEnd) : learnedMaxWm2;
    return scaled * LEARNED_MAX_TO_TYPICAL;
}

/**
 * Model A: estimates cloud cover from measured solar radiation and the current sun elevation.
 *
 * @param solarRadWm2 - Measured solar radiation in W/m²
 * @param elevationDeg - Current sun elevation angle in degrees
 * @param learnedClearSky - Optional site-learned clear-sky maximum (W/m²) for this elevation
 *   bucket, e.g. from `clearskyreference.ts`. When available, it is scaled to the current
 *   elevation and treated as a best-ever outlier rather than a typical clear day.
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
        learnedClearSky !== undefined && learnedClearSky > 0
            ? scaleLearnedClearSky(learnedClearSky, elevationDeg)
            : clearSkyIrradiance(elevationDeg) * HAURWITZ_SITE_FACTOR;
    if (clearSky <= 0) {
        return undefined;
    }

    const kt = Math.min(1.2, Math.max(0, solarRadWm2 / clearSky));

    if (kt >= KT_CLEAR) {
        return 0;
    }
    if (kt <= KT_OVERCAST) {
        return 100;
    }
    return Math.round(100 * (1 - (kt - KT_OVERCAST) / (KT_CLEAR - KT_OVERCAST)));
}

/** Dew point depression (°C) at/below which the sky is assumed fully overcast/foggy */
const DEPRESSION_OVERCAST_C = 1;
/**
 * Dew point depression (°C) at/above which the sky is assumed clear.
 * Kept tight on purpose: humidity is not cloud cover. A typical clear summer
 * morning in temperate climates has a depression of ~4–8 °C and must not be
 * classified as cloudy/overcast.
 */
const DEPRESSION_CLEAR_C = 4;
/** Cloud cover adjustment (percentage points) per hPa/3h of barometric trend */
const PRESSURE_TREND_FACTOR = 5;
/** Maximum adjustment magnitude applied from the pressure trend correction */
const MAX_PRESSURE_ADJUSTMENT = 15;

/**
 * Model B: rough fallback cloud cover estimate based on the dew point depression,
 * optionally refined with the barometric pressure trend. Used when no solar
 * radiation sensor is present. Not used at night/dawn when a solar estimate
 * from earlier in the day is still available (see `main.ts`).
 *
 * This is a heuristic trend indicator, not a physically grounded measurement -
 * near-saturation conditions (fog, low cloud) are fairly reliable, but moderate
 * humidity must not be mapped to high cloud cover.
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

    const adjustment = Math.min(
        MAX_PRESSURE_ADJUSTMENT,
        Math.max(-MAX_PRESSURE_ADJUSTMENT, -barTrendHpa * PRESSURE_TREND_FACTOR),
    );
    percent = Math.min(100, Math.max(0, percent + adjustment));

    return { percent: Math.round(percent), model: 'heuristic+pressure' };
}
