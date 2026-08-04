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
    | 'clear'
    | 'mostlyClear'
    | 'partlyCloudy'
    | 'cloudy'
    | 'overcast'
    | 'fog'
    | 'drizzle'
    | 'rain'
    | 'heavyRain'
    | 'sleet'
    | 'snow'
    | 'heavySnow'
    | 'thunderstorm';

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
    drizzle: 51,
    rain: 61,
    heavyRain: 65,
    sleet: 68,
    snow: 71,
    heavySnow: 75,
    thunderstorm: 95,
};

/** German display labels for each condition, used by the "Wetter" HTML widget (see `htmlwidget.ts`) */
const STATE_LABEL_DE: Record<WeatherState, string> = {
    clear: 'Klar',
    mostlyClear: 'Überwiegend klar',
    partlyCloudy: 'Teilweise bewölkt',
    cloudy: 'Bewölkt',
    overcast: 'Bedeckt',
    fog: 'Nebel',
    drizzle: 'Leichter Regen',
    rain: 'Regen',
    heavyRain: 'Starkregen',
    sleet: 'Schneeregen',
    snow: 'Schnee',
    heavySnow: 'Starker Schneefall',
    thunderstorm: 'Gewitter',
};

/**
 * Returns the German display label for a derived weather condition.
 *
 * @param state - The derived weather condition
 * @returns The German display label, e.g. "Bedeckt"
 */
export function getWeatherStateLabel(state: WeatherState): string {
    return STATE_LABEL_DE[state];
}

/**
 * Picks the bundled icon file for a condition and day/night variant.
 *
 * @param state - The derived weather condition
 * @param isDay - Whether the sun is currently above the horizon
 * @param cloudCoverPercent - Estimated cloud cover in percent (0-100), used to pick a
 *   "partly cloudy + precipitation" variant instead of the plain precipitation icon when
 *   the sky isn't (near-)overcast
 * @returns Relative path to the icon file within `admin/img/weathericons`
 */
function iconFor(state: WeatherState, isDay: boolean, cloudCoverPercent?: number): string {
    const dayNight = isDay ? 'day' : 'night';
    const isOvercast = cloudCoverPercent === undefined || cloudCoverPercent > 70;
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
        case 'drizzle':
        case 'rain':
        case 'heavyRain':
            return isOvercast ? 'img/weathericons/rain.svg' : `img/weathericons/partly-cloudy-${dayNight}-rain.svg`;
        case 'sleet':
            return 'img/weathericons/sleet.svg';
        case 'snow':
        case 'heavySnow':
            return isOvercast ? 'img/weathericons/snow.svg' : `img/weathericons/partly-cloudy-${dayNight}-snow.svg`;
        case 'thunderstorm':
            return 'img/weathericons/thunderstorms-rain.svg';
    }
}

/** Below this rain rate (mm/h), precipitation is classified as drizzle rather than "regular" rain */
const DRIZZLE_MAX_RATE_MMH = 0.5;
/** Below this rain rate (mm/h), snow is classified as "regular" rather than heavy snow */
const HEAVY_SNOW_RATE_MMH = 2;
/** Temperature range (°C) around freezing in which mixed/refreezing precipitation (sleet) is assumed possible */
const SLEET_MIN_TEMP_C = 0;
const SLEET_MAX_TEMP_C = 2;

/** Below this dew point depression (°C), conditions are assumed foggy rather than just "overcast" */
const FOG_DEPRESSION_C = 0.5;
/** Below this wind speed (km/h), fog is plausible; stronger wind would disperse it */
const FOG_MAX_WIND_KMH = 10;
/** Rain rate (mm/h - always in this internal unit regardless of the adapter's display unit setting) above which conditions are classified as a thunderstorm candidate */
const HEAVY_RAIN_RATE_MMH = 4;
/** Gust-over-average delta (km/h) between the 2-min high and the 10-min average wind speed that is treated as a gust-front signal for thunderstorm detection */
const GUST_FRONT_DELTA_KMH = 20;
/** 3-hour barometric pressure trend (hPa) at/below which a sharp pressure drop is treated as a thunderstorm signal */
const PRESSURE_DROP_SIGNAL_HPA = -1.5;

/**
 * Decides whether heavy rain is accompanied by enough corroborating signals to be treated as a
 * thunderstorm candidate rather than plain heavy/sustained rain. Since the WeatherLink Live cannot
 * detect lightning directly, this combines independent proxy signals - a near-overcast sky, a
 * gust-front wind spike (2-min high well above the 10-min average), and a sharp 3-hour pressure
 * drop - and requires agreement between at least two of them whenever more than one is available,
 * so a single ambiguous signal (e.g. just an overcast sky, which also occurs with ordinary
 * frontal rain) isn't enough on its own.
 *
 * @param cloudCoverPercent - Estimated cloud cover in percent (0-100), if computable
 * @param windGustKmh - 2-minute high wind speed in km/h, if available
 * @param windAvgKmh - 10-minute average wind speed in km/h, if available
 * @param barTrendHpa - 3-hour barometric pressure trend in hPa (negative = falling), if available
 * @returns `true` if enough signals corroborate a thunderstorm-prone situation
 */
function isThunderstormLikely(
    cloudCoverPercent?: number,
    windGustKmh?: number,
    windAvgKmh?: number,
    barTrendHpa?: number,
): boolean {
    const cloudCoverSignal = cloudCoverPercent !== undefined ? cloudCoverPercent >= 70 : undefined;
    const gustFrontSignal =
        windGustKmh !== undefined && windAvgKmh !== undefined
            ? windGustKmh - windAvgKmh >= GUST_FRONT_DELTA_KMH
            : undefined;
    const pressureDropSignal = barTrendHpa !== undefined ? barTrendHpa <= PRESSURE_DROP_SIGNAL_HPA : undefined;

    const signals = [cloudCoverSignal, gustFrontSignal, pressureDropSignal].filter(
        (signal): signal is boolean => signal !== undefined,
    );
    const positiveSignals = signals.filter(Boolean).length;

    if (signals.length === 0) {
        return false;
    }
    // With only a single available signal, that one signal alone has to suffice (this keeps
    // stations without a barometer/anemometer working as before); once more than one
    // corroborating signal is available, require at least two to agree.
    return signals.length === 1 ? positiveSignals >= 1 : positiveSignals >= 2;
}

/**
 * Derives a simplified weather condition/icon from the current sensor readings.
 *
 * All physical inputs are expected in metric units (°C, mm/h, km/h) regardless of the
 * adapter's display unit setting, so that the classification thresholds below are consistent -
 * unit conversion for display purposes happens separately.
 *
 * The Davis WeatherLink Live has no lightning sensor support (unlike the older Vantage Pro2/Vue
 * serial protocol or WeatherLink cloud/AirLink), so thunderstorms can never be directly detected -
 * only inferred from conditions that commonly accompany them. To keep the false-positive rate
 * manageable, thunderstorm classification requires heavy rain plus at least one corroborating
 * signal (a near-overcast sky, a gust-front wind spike, or a sharp pressure drop); if more than
 * one of these signals is available, at least two of them must agree before a thunderstorm is
 * reported, since a single signal (e.g. just an overcast sky) is also compatible with ordinary
 * sustained heavy rain.
 *
 * @param options - The available current readings; any of them may be `undefined` if the corresponding sensor is not installed
 * @param options.cloudCoverPercent - Estimated cloud cover in percent (0-100), if computable
 * @param options.rainRateLast - Current rain rate in mm/h, if a rain sensor is present
 * @param options.tempC - Current outside temperature in °C, used to distinguish rain/drizzle from sleet and snow
 * @param options.dewPointDepressionC - Temperature minus dew point in °C, used for fog detection
 * @param options.windSpeed - Current wind speed in km/h, used to rule out fog when it's windy
 * @param options.windGustKmh - 2-minute high wind speed in km/h, used together with `windAvgKmh` as a gust-front signal for thunderstorm detection
 * @param options.windAvgKmh - 10-minute average wind speed in km/h, used together with `windGustKmh` as a gust-front signal for thunderstorm detection
 * @param options.barTrendHpa - 3-hour barometric pressure trend in hPa (negative = falling), used as a sharp-pressure-drop signal for thunderstorm detection
 * @param options.isDay - Whether the sun is currently above the horizon (selects the day/night icon variant)
 * @returns The derived condition and icon, or `undefined` if neither cloud cover nor rain data is available
 */
export function computeWeatherIcon(options: {
    cloudCoverPercent?: number;
    rainRateLast?: number;
    tempC?: number;
    dewPointDepressionC?: number;
    windSpeed?: number;
    windGustKmh?: number;
    windAvgKmh?: number;
    barTrendHpa?: number;
    isDay: boolean;
}): WeatherIconResult | undefined {
    const {
        cloudCoverPercent,
        rainRateLast,
        tempC,
        dewPointDepressionC,
        windSpeed,
        windGustKmh,
        windAvgKmh,
        barTrendHpa,
        isDay,
    } = options;

    if (cloudCoverPercent === undefined && (rainRateLast === undefined || rainRateLast <= 0)) {
        // Neither the cloud cover model nor a currently active rain sensor gives us anything to go on.
        return undefined;
    }

    let state: WeatherState;

    if (rainRateLast !== undefined && rainRateLast > 0) {
        const isSnow = tempC !== undefined && tempC <= SLEET_MIN_TEMP_C;
        const isSleet = tempC !== undefined && tempC > SLEET_MIN_TEMP_C && tempC <= SLEET_MAX_TEMP_C;
        const isHeavy = rainRateLast >= HEAVY_RAIN_RATE_MMH;
        if (isSnow) {
            state = isHeavy || rainRateLast >= HEAVY_SNOW_RATE_MMH ? 'heavySnow' : 'snow';
        } else if (isSleet) {
            // Precipitation falling through/near-freezing air can refreeze as sleet/freezing rain;
            // this cannot distinguish the two, so both are reported under the combined "sleet" state.
            state = 'sleet';
        } else if (isHeavy && isThunderstormLikely(cloudCoverPercent, windGustKmh, windAvgKmh, barTrendHpa)) {
            // Heavy rain plus at least one (or, if more are available, at least two) corroborating
            // signal(s) is a reasonable proxy for thunderstorm-prone conditions; this cannot detect
            // lightning/thunder itself (the WeatherLink Live has no lightning sensor support), just
            // flags conditions where a thunderstorm is plausible.
            state = 'thunderstorm';
        } else if (isHeavy) {
            state = 'heavyRain';
        } else if (rainRateLast <= DRIZZLE_MAX_RATE_MMH) {
            state = 'drizzle';
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
        iconPath: iconFor(state, isDay, cloudCoverPercent),
    };
}
