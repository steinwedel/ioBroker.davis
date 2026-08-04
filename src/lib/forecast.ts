/**
 * Fetches and processes the multi-day weather forecast from Bright Sky (https://brightsky.dev),
 * a free, keyless wrapper around the open DWD (Deutscher Wetterdienst) weather data, for the
 * "Wetter" HTML widget (see `htmlwidget.ts` for rendering, `main.ts` for scheduling/state I/O).
 */

export type BrightSkyIcon =
    | 'clear-day'
    | 'clear-night'
    | 'partly-cloudy-day'
    | 'partly-cloudy-night'
    | 'cloudy'
    | 'fog'
    | 'wind'
    | 'rain'
    | 'sleet'
    | 'snow'
    | 'hail'
    | 'thunderstorm';

export type BrightSkyCondition = 'dry' | 'fog' | 'rain' | 'sleet' | 'snow' | 'hail' | 'thunderstorm';

/** A single hourly entry from Bright Sky's `/weather` endpoint (only the fields this adapter uses) */
export interface BrightSkyHourly {
    timestamp: string;
    temperature: number | null;
    wind_speed: number | null;
    precipitation: number | null;
    icon: BrightSkyIcon | null;
    condition: BrightSkyCondition | null;
}

export interface BrightSkyResponse {
    weather: BrightSkyHourly[];
}

/** Maximum number of forecast days to build (today plus this many additional days) */
export const FORECAST_DAYS = 8;

/** German display titles for Bright Sky's `condition` field, used as the forecast icon tooltip */
const CONDITION_TEXT_DE: Record<BrightSkyCondition, string> = {
    dry: 'Trocken',
    fog: 'Nebel',
    rain: 'Regen',
    sleet: 'Schneeregen',
    snow: 'Schnee',
    hail: 'Hagel',
    thunderstorm: 'Gewitter',
};

/**
 * The hour-of-day boundaries between the four 6-hour display blocks (00-06/06-12/12-18/18-24)
 *
 * @param hour
 */
function blockForHour(hour: number): 0 | 1 | 2 | 3 {
    if (hour < 6) {
        return 0;
    }
    if (hour < 12) {
        return 1;
    }
    if (hour < 18) {
        return 2;
    }
    return 3;
}

/** The hour closest to the middle of each 6-hour block, used to pick each block's representative icon */
const BLOCK_MID_HOUR: readonly [number, number, number, number] = [3, 9, 15, 21];

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

/**
 * Formats a date as `YYYY-MM-DD` in local time, as required by Bright Sky's `date`/`last_date`
 * query parameters.
 *
 * @param date
 */
export function formatDateForBrightSky(date: Date): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Builds the Bright Sky API request URL for an 8-day forecast starting today.
 *
 * @param latitude - Observer latitude in degrees
 * @param longitude - Observer longitude in degrees
 * @param today - The current date (local time); only its calendar date is used
 */
export function buildBrightSkyUrl(latitude: number, longitude: number, today: Date): string {
    const lastDate = new Date(today.getTime() + (FORECAST_DAYS - 1) * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
        date: formatDateForBrightSky(today),
        last_date: formatDateForBrightSky(lastDate),
        tz: 'Europe/Berlin',
    });
    return `https://api.brightsky.dev/weather?${params.toString()}`;
}

/** A single processed forecast day, matching `htmlwidget.ts`'s `ForecastDay` shape but without icon URLs yet */
interface RawForecastDay {
    weekday: number;
    tempMin: number;
    tempMax: number;
    windMin: number;
    windMax: number;
    rainfallMm: number;
    blockIcon: [BrightSkyIcon | null, BrightSkyIcon | null, BrightSkyIcon | null, BrightSkyIcon | null];
    blockCondition: [
        BrightSkyCondition | null,
        BrightSkyCondition | null,
        BrightSkyCondition | null,
        BrightSkyCondition | null,
    ];
    /** Hour used to pick each block's representative reading, for day/night icon variant selection */
    blockHour: [number, number, number, number];
}

/**
 * Groups Bright Sky's hourly forecast into up to `FORECAST_DAYS` daily summaries (min/max
 * temperature and wind, total rainfall per 6-hour block, and a representative icon/condition per
 * block).
 *
 * @param hourly - The raw hourly entries from Bright Sky's response, in chronological order
 * @returns The processed forecast days, in chronological order
 */
function groupForecastByDay(hourly: BrightSkyHourly[]): RawForecastDay[] {
    const days: RawForecastDay[] = [];
    const dayIndexByDate = new Map<string, number>();

    for (const entry of hourly) {
        const ts = new Date(entry.timestamp);
        const dateKey = `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}`;
        const hour = ts.getHours();
        const block = blockForHour(hour);

        let dayIdx = dayIndexByDate.get(dateKey);
        if (dayIdx === undefined) {
            if (days.length >= FORECAST_DAYS) {
                continue;
            }
            dayIdx = days.length;
            dayIndexByDate.set(dateKey, dayIdx);
            days.push({
                weekday: ts.getDay(),
                tempMin: entry.temperature ?? Number.POSITIVE_INFINITY,
                tempMax: entry.temperature ?? Number.NEGATIVE_INFINITY,
                windMin: entry.wind_speed ?? Number.POSITIVE_INFINITY,
                windMax: entry.wind_speed ?? Number.NEGATIVE_INFINITY,
                rainfallMm: 0,
                blockIcon: [null, null, null, null],
                blockCondition: [null, null, null, null],
                blockHour: [-1, -1, -1, -1],
            });
        }
        const day = days[dayIdx];

        if (typeof entry.temperature === 'number') {
            day.tempMin = Math.min(day.tempMin, entry.temperature);
            day.tempMax = Math.max(day.tempMax, entry.temperature);
        }
        if (typeof entry.wind_speed === 'number') {
            day.windMin = Math.min(day.windMin, entry.wind_speed);
            day.windMax = Math.max(day.windMax, entry.wind_speed);
        }
        if (typeof entry.precipitation === 'number') {
            day.rainfallMm += entry.precipitation;
        }

        // The block's representative reading is the one closest to the block's middle hour
        const distance = Math.abs(hour - BLOCK_MID_HOUR[block]);
        if (day.blockHour[block] === -1 || distance < Math.abs(day.blockHour[block] - BLOCK_MID_HOUR[block])) {
            day.blockHour[block] = hour;
            day.blockIcon[block] = entry.icon;
            day.blockCondition[block] = entry.condition;
        }
    }

    return days;
}

/**
 * Maps a Bright Sky icon (plus a day/night hint, needed only for its generic "fog" icon) to the
 * matching bundled SVG file name (see `admin/img/weathericons/`, the same icon set the adapter's
 * own `weathericon.ts` current-conditions estimation uses).
 *
 * @param icon - The Bright Sky icon identifier, or `null` if unavailable for this block
 * @param isDay - Whether this block's representative hour falls between sunrise and sunset
 * @returns The icon file name (without extension/path), or `undefined` if unavailable/unmapped
 */
function iconFileName(icon: BrightSkyIcon | null, isDay: boolean): string | undefined {
    switch (icon) {
        case 'clear-day':
            return 'clear-day';
        case 'clear-night':
            return 'clear-night';
        case 'partly-cloudy-day':
            return 'partly-cloudy-day';
        case 'partly-cloudy-night':
            return 'partly-cloudy-night';
        case 'cloudy':
            return 'cloudy';
        case 'fog':
            return isDay ? 'fog-day' : 'fog-night';
        case 'wind':
            return 'wind';
        case 'rain':
            return 'rain';
        case 'sleet':
            return 'sleet';
        case 'snow':
            return 'snow';
        case 'hail':
            return 'hail';
        case 'thunderstorm':
            return 'thunderstorms-rain';
        default:
            return undefined;
    }
}

export interface ProcessedForecastDay {
    weekday: number;
    tempMin: number;
    tempMax: number;
    windMin: number;
    windMax: number;
    rainfallMm: number;
    /** Icon file name (without extension/path) for each of the four 6-hour blocks, or "" if unavailable */
    blockIconFile: [string, string, string, string];
    blockTitle: [string, string, string, string];
}

/**
 * Processes a raw Bright Sky response into up to `FORECAST_DAYS` daily summaries ready for
 * rendering (see `htmlwidget.ts`'s `buildForecastHtml()`), resolving each block's icon file name
 * and German condition title.
 *
 * @param response - The raw Bright Sky API response
 * @param isDaytime - Callback used to determine day/night for a given hour-of-day (0-23), for
 *   the day/night icon variant of Bright Sky's generic "fog" icon; see `main.ts` for how this is
 *   derived from the adapter's own sunrise/sunset calculation
 */
export function processBrightSkyForecast(
    response: BrightSkyResponse,
    isDaytime: (hour: number) => boolean,
): ProcessedForecastDay[] {
    const days = groupForecastByDay(response.weather ?? []);
    return days.map(day => {
        const blockIconFile = day.blockIcon.map((icon, i) => {
            const fileName = iconFileName(icon, isDaytime(day.blockHour[i]));
            return fileName ?? '';
        }) as [string, string, string, string];
        const blockTitle = day.blockCondition.map(condition => (condition ? CONDITION_TEXT_DE[condition] : '')) as [
            string,
            string,
            string,
            string,
        ];

        return {
            weekday: day.weekday,
            tempMin: day.tempMin,
            tempMax: day.tempMax,
            windMin: day.windMin,
            windMax: day.windMax,
            rainfallMm: day.rainfallMm,
            blockIconFile,
            blockTitle,
        };
    });
}
