/**
 * Derives a simplified weather icon/condition from Davis WeatherLink Live
 * sensor data, in a scheme inspired by the WMO "significant weather" (ww)
 * codes that services like DWD's MOSMIX also use, but reduced to the
 * categories that can reliably be derived from a single point-in-time
 * station reading (a forecast's finer-grained ww code table distinguishes
 * things like "thunderstorm within the last hour, now over" that cannot be
 * determined from current sensor values alone).
 *
 * The actual icon graphics are a subset of "Meteocons" by Bas Milius
 * (MIT license, see admin/img/weathericons/LICENSE), bundled locally so the
 * adapter works without any external/online dependency.
 */

export type WeatherState =
    'clear' | 'mostlyClear' | 'partlyCloudy' | 'cloudy' | 'overcast' | 'fog' | 'rain' | 'snow' | 'thunderstorm';

/** The result of a weather icon estimation, including its condition code and icon path */
export interface WeatherIconResult {
    /** Simplified WMO-inspired significant weather code */
    code: number;
    /** Machine-readable condition identifier */
    state: WeatherState;
    /** Relative path (within this adapter's `admin` directory) to the matching icon */
    iconPath: string;
}

/** WMO ww-code-inspired numeric codes for each condition (subset of the full 0-99 table) */
const WMO_CODE: Record<WeatherState, number> = {
    clear: 0,
    mostlyClear: 1,
    partlyCloudy: 2,
    cloudy: 3,
    overcast: 3,
    fog: 45,
    rain: 61,
    snow: 71,
    thunderstorm: 95,
};

/**
 * Picks the bundled icon file for a condition and day/night variant.
 *
 * @param state - The derived weather condition
 * @param isDay - Whether the sun is currently above the horizon
 * @returns Relative path to the icon file within `admin/img/weathericons`
 */
function iconFor(state: WeatherState, isDay: boolean): string {
    const dayNight = isDay ? 'day' : 'night';
    switch (state) {
        case 'clear':
        case 'mostlyClear':
            return `img/weathericons/clear-${dayNight}.svg`;
        case 'partlyCloudy':
            return `img/weathericons/partly-cloudy-${dayNight}.svg`;
        case 'cloudy':
            return 'img/weathericons/cloudy.svg';
        case 'overcast':
            return `img/weathericons/overcast-${dayNight}.svg`;
        case 'fog':
            return `img/weathericons/fog-${dayNight}.svg`;
        case 'rain':
            return 'img/weathericons/rain.svg';
        case 'snow':
            return 'img/weathericons/snow.svg';
        case 'thunderstorm':
            return 'img/weathericons/thunderstorms-rain.svg';
    }
}

/** Below this dew point depression (°C), conditions are assumed foggy rather than just "overcast" */
const FOG_DEPRESSION_C = 0.5;
/** Below this wind speed (km/h), fog is plausible; stronger wind would disperse it */
const FOG_MAX_WIND_KMH = 10;
/** Rain rate (mm/h - always in this internal unit regardless of the adapter's display unit setting) above which conditions are classified as a thunderstorm candidate */
const HEAVY_RAIN_RATE_MMH = 4;

/**
 * Derives a simplified weather condition/icon from the current sensor readings.
 *
 * All physical inputs are expected in metric units (°C, mm/h, km/h) regardless of the
 * adapter's display unit setting, so that the classification thresholds below are consistent -
 * unit conversion for display purposes happens separately.
 *
 * @param options - The available current readings; any of them may be `undefined` if the corresponding sensor is not installed
 * @param options.cloudCoverPercent - Estimated cloud cover in percent (0-100), if computable
 * @param options.rainRateLast - Current rain rate in mm/h, if a rain sensor is present
 * @param options.tempC - Current outside temperature in °C, used to distinguish rain from snow
 * @param options.dewPointDepressionC - Temperature minus dew point in °C, used for fog detection
 * @param options.windSpeed - Current wind speed in km/h, used to rule out fog when it's windy
 * @param options.isDay - Whether the sun is currently above the horizon (selects the day/night icon variant)
 * @returns The derived condition and icon, or `undefined` if neither cloud cover nor rain data is available
 */
export function computeWeatherIcon(options: {
    cloudCoverPercent?: number;
    rainRateLast?: number;
    tempC?: number;
    dewPointDepressionC?: number;
    windSpeed?: number;
    isDay: boolean;
}): WeatherIconResult | undefined {
    const { cloudCoverPercent, rainRateLast, tempC, dewPointDepressionC, windSpeed, isDay } = options;

    if (cloudCoverPercent === undefined && (rainRateLast === undefined || rainRateLast <= 0)) {
        // Neither the cloud cover model nor a currently active rain sensor gives us anything to go on.
        return undefined;
    }

    let state: WeatherState;

    if (rainRateLast !== undefined && rainRateLast > 0) {
        const isSnow = tempC !== undefined && tempC <= 1;
        const isHeavy = rainRateLast >= HEAVY_RAIN_RATE_MMH;
        if (isSnow) {
            state = 'snow';
        } else if (isHeavy && cloudCoverPercent !== undefined && cloudCoverPercent >= 70) {
            // Heavy rain with (near-)overcast skies is a reasonable proxy for thunderstorm-prone conditions;
            // this cannot detect lightning/thunder itself, just flags conditions where it's plausible.
            state = 'thunderstorm';
        } else {
            state = 'rain';
        }
    } else if (
        dewPointDepressionC !== undefined &&
        dewPointDepressionC <= FOG_DEPRESSION_C &&
        (windSpeed === undefined || windSpeed <= FOG_MAX_WIND_KMH)
    ) {
        state = 'fog';
    } else if (cloudCoverPercent !== undefined) {
        if (cloudCoverPercent <= 10) {
            state = 'clear';
        } else if (cloudCoverPercent <= 40) {
            state = 'mostlyClear';
        } else if (cloudCoverPercent <= 70) {
            state = 'partlyCloudy';
        } else if (cloudCoverPercent <= 90) {
            state = 'cloudy';
        } else {
            state = 'overcast';
        }
    } else {
        // Rain sensor exists and is currently at 0, but no cloud cover info at all: nothing reliable to report.
        return undefined;
    }

    return {
        code: WMO_CODE[state],
        state,
        iconPath: iconFor(state, isDay),
    };
}
