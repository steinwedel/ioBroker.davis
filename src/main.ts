/*
 * Created with @iobroker/create-adapter v3.1.5
 */

import * as dgram from 'node:dgram';
import * as utils from '@iobroker/adapter-core';
import { computeCloudCoverHeuristic, computeCloudCoverSolar, type CloudCoverModel } from './lib/cloudcover';
import { discoverWeatherLinkLive } from './lib/discovery';
import { getSolarElevationDeg } from './lib/sun';
import { computeWeatherIcon } from './lib/weathericon';
import { getReference, recordObservation, type ClearSkyReferenceMap } from './lib/clearskyreference';
import { addSample, type TimedSample } from './lib/movingaverage';
import { getCompassDirection, computeDirectionSpread } from './lib/winddirection';
import { getUvRiskLevelLabel } from './lib/uvindex';
import { getRainIntensityLevelLabel } from './lib/rainintensity';
import { isFrostRisk } from './lib/frost';
import { getHeatRiskLevelLabel } from './lib/heatindex';
import { getDewPointComfortLevelLabel } from './lib/dewpointcomfort';
import { computeEvapotranspiration } from './lib/evapotranspiration';
import { updateMinMax, type MinMaxState } from './lib/minmax';
import {
    convertRainCount,
    convertValue,
    getRainUnitLabel,
    getUnitLabel,
    type UnitKind,
    type UnitSystem,
} from './lib/units';
import {
    DataStructureType,
    type Condition,
    type CurrentConditionsResponse,
    type IssCondition,
    type LeafSoilCondition,
    type LssBarCondition,
    type LssTempHumCondition,
    type RealTimeActivationResponse,
    type RealtimeBroadcastPacket,
} from './lib/weatherlink-types';

/** Describes how a single field of a condition record maps to an ioBroker state */
interface FieldDefinition<T> {
    key: keyof T;
    id: string;
    name: string;
    type: 'number' | 'boolean' | 'string';
    role: string;
    /** Static unit label for fields that are the same in both unit systems (e.g. "%", "W/m²") */
    unit?: string;
    /** For fields whose unit/value depends on the selected unit system (temperature, wind speed, pressure) */
    unitKind?: UnitKind;
    /** Marks a raw rain tip count that must be converted to mm/in using the record's `rain_size` */
    isRain?: boolean;
    /** For rain fields that represent a rate (counts/hour) rather than an accumulated amount */
    isRainRate?: boolean;
    /** Marks a wind direction field for which a companion `<id>Text` compass-direction state (e.g. "NNO") should also be created */
    compassText?: boolean;
    /** Marks a UNIX epoch (seconds) field that should be converted to an ISO 8601 datetime string instead of being stored as a raw number */
    isTimestamp?: boolean;
    /** Marks a UV index field for which a companion `<id>Text` risk-category state (e.g. "Mäßig") should also be created */
    uvRiskText?: boolean;
    /** Marks a rain rate field for which a companion `<id>Text` intensity-category state (e.g. "Mäßig") should also be created */
    rainIntensityText?: boolean;
    /** Marks the outside temperature field for which a companion `<id>FrostWarning` boolean state should also be created */
    frostWarning?: boolean;
    /** Marks a heat index-like field for which a companion `<id>Text` heat-risk-category state (e.g. "Vorsicht") should also be created */
    heatRiskText?: boolean;
    /** Marks the dew point field for which a companion `<id>Text` mugginess-category state (e.g. "Schwül") should also be created */
    dewPointComfortText?: boolean;
    /** Marks a field whose day/month/year/all-time min and max (each with an occurrence timestamp) should be tracked; see `lib/minmax.ts` */
    trackMinMax?: boolean;
    /** Marks a wind direction field for which a companion `<id>Spread5Min` state tracks the continuously-updated angular spread ("opening angle") of the last 5 minutes of readings; see `lib/winddirection.ts`'s `computeDirectionSpread()` */
    directionSpread5Min?: boolean;
    states?: Record<number, string>;
}

const ISS_FIELDS: FieldDefinition<IssCondition>[] = [
    {
        key: 'temp',
        id: 'temperature',
        name: 'Temperature',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
        trackMinMax: true,
        frostWarning: true,
    },
    {
        key: 'hum',
        id: 'humidity',
        name: 'Humidity',
        type: 'number',
        role: 'value.humidity',
        unit: '%',
        trackMinMax: true,
    },
    {
        key: 'dew_point',
        id: 'dewPoint',
        name: 'Dew point',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
        trackMinMax: true,
        dewPointComfortText: true,
    },
    {
        key: 'wet_bulb',
        id: 'wetBulb',
        name: 'Wet bulb temperature',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
    },
    {
        key: 'wind_chill',
        id: 'windChill',
        name: 'Wind chill',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
    },
    {
        key: 'heat_index',
        id: 'heatIndex',
        name: 'Heat index',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
        trackMinMax: true,
        heatRiskText: true,
    },
    {
        key: 'thw_index',
        id: 'thwIndex',
        name: 'THW index',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
    },
    {
        key: 'thsw_index',
        id: 'thswIndex',
        name: 'THSW index',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
    },
    {
        key: 'wind_speed_last',
        id: 'windSpeedLast',
        name: 'Wind speed (last)',
        type: 'number',
        role: 'value.speed.wind',
        unitKind: 'windSpeed',
        trackMinMax: true,
    },
    {
        key: 'wind_dir_last',
        id: 'windDirLast',
        name: 'Wind direction (last)',
        type: 'number',
        role: 'value.direction.wind',
        unit: '°',
        compassText: true,
        directionSpread5Min: true,
    },
    {
        key: 'wind_speed_avg_last_10_min',
        id: 'windSpeedAvg10Min',
        name: 'Wind speed avg (10 min)',
        type: 'number',
        role: 'value.speed.wind',
        unitKind: 'windSpeed',
    },
    {
        key: 'wind_dir_scalar_avg_last_10_min',
        id: 'windDirAvg10Min',
        name: 'Wind direction avg (10 min)',
        type: 'number',
        role: 'value.direction.wind',
        unit: '°',
        compassText: true,
    },
    {
        key: 'wind_speed_hi_last_2_min',
        id: 'windSpeedHi2Min',
        name: 'Wind gust (2 min)',
        type: 'number',
        role: 'value.speed.wind.max',
        unitKind: 'windSpeed',
    },
    {
        key: 'wind_dir_at_hi_speed_last_2_min',
        id: 'windDirHi2Min',
        name: 'Wind direction at gust (2 min)',
        type: 'number',
        role: 'value.direction.wind',
        unit: '°',
        compassText: true,
    },
    {
        key: 'wind_speed_hi_last_10_min',
        id: 'windSpeedHi10Min',
        name: 'Wind gust (10 min)',
        type: 'number',
        role: 'value.speed.wind.max',
        unitKind: 'windSpeed',
    },
    {
        key: 'wind_dir_at_hi_speed_last_10_min',
        id: 'windDirHi10Min',
        name: 'Wind direction at gust (10 min)',
        type: 'number',
        role: 'value.direction.wind',
        unit: '°',
        compassText: true,
    },
    {
        key: 'rain_rate_last',
        id: 'rainRateLast',
        name: 'Rain rate',
        type: 'number',
        role: 'value.precipitation',
        isRain: true,
        isRainRate: true,
        rainIntensityText: true,
    },
    {
        key: 'rain_rate_hi',
        id: 'rainRateHi',
        name: 'Rain rate (peak)',
        type: 'number',
        role: 'value.precipitation',
        isRain: true,
        isRainRate: true,
    },
    {
        key: 'rainfall_last_15_min',
        id: 'rainfall15Min',
        name: 'Rainfall (last 15 min)',
        type: 'number',
        role: 'value.precipitation',
        isRain: true,
    },
    {
        key: 'rain_rate_hi_last_15_min',
        id: 'rainRateHi15Min',
        name: 'Rain rate (peak, last 15 min)',
        type: 'number',
        role: 'value.precipitation',
        isRain: true,
        isRainRate: true,
    },
    {
        key: 'rainfall_last_60_min',
        id: 'rainfall60Min',
        name: 'Rainfall (last 60 min)',
        type: 'number',
        role: 'value.precipitation',
        isRain: true,
    },
    {
        key: 'rainfall_last_24_hr',
        id: 'rainfall24Hr',
        name: 'Rainfall (last 24 h)',
        type: 'number',
        role: 'value.precipitation',
        isRain: true,
    },
    {
        key: 'rainfall_daily',
        id: 'rainfallDaily',
        name: 'Rainfall today',
        type: 'number',
        role: 'value.rain.today',
        isRain: true,
    },
    {
        key: 'rainfall_monthly',
        id: 'rainfallMonthly',
        name: 'Rainfall this month',
        type: 'number',
        role: 'value.precipitation',
        isRain: true,
    },
    {
        key: 'rainfall_year',
        id: 'rainfallYear',
        name: 'Rainfall this year',
        type: 'number',
        role: 'value.precipitation',
        isRain: true,
    },
    {
        key: 'rain_storm',
        id: 'rainStorm',
        name: 'Current rain storm total',
        type: 'number',
        role: 'value.precipitation',
        isRain: true,
    },
    {
        key: 'rain_storm_start_at',
        id: 'rainStormStartAt',
        name: 'Current rain storm start',
        type: 'string',
        role: 'date',
        isTimestamp: true,
    },
    {
        key: 'rain_storm_last',
        id: 'rainStormLast',
        name: 'Last rain storm total',
        type: 'number',
        role: 'value.precipitation',
        isRain: true,
    },
    {
        key: 'rain_storm_last_start_at',
        id: 'rainStormLastStartAt',
        name: 'Last rain storm start',
        type: 'string',
        role: 'date',
        isTimestamp: true,
    },
    {
        key: 'rain_storm_last_end_at',
        id: 'rainStormLastEndAt',
        name: 'Last rain storm end',
        type: 'string',
        role: 'date',
        isTimestamp: true,
    },
    {
        key: 'solar_rad',
        id: 'solarRad',
        name: 'Solar radiation',
        type: 'number',
        role: 'value',
        unit: 'W/m²',
        trackMinMax: true,
    },
    {
        key: 'uv_index',
        id: 'uvIndex',
        name: 'UV index',
        type: 'number',
        role: 'value',
        unit: 'Index',
        uvRiskText: true,
        trackMinMax: true,
    },
    {
        key: 'trans_battery_flag',
        id: 'lowBattery',
        name: 'Transmitter battery low',
        type: 'boolean',
        role: 'indicator.lowbat',
    },
    {
        key: 'rx_state',
        id: 'receptionState',
        name: 'Radio reception state',
        type: 'number',
        role: 'value',
        states: { 0: 'Synched & Tracking', 1: 'Synched', 2: 'Scanning' },
    },
];

const LEAF_SOIL_FIELDS: FieldDefinition<LeafSoilCondition>[] = [
    {
        key: 'temp_1',
        id: 'soilTemp1',
        name: 'Soil temperature 1',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
    },
    {
        key: 'temp_2',
        id: 'soilTemp2',
        name: 'Soil temperature 2',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
    },
    {
        key: 'temp_3',
        id: 'soilTemp3',
        name: 'Soil temperature 3',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
    },
    {
        key: 'temp_4',
        id: 'soilTemp4',
        name: 'Soil temperature 4',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
    },
    {
        key: 'moist_soil_1',
        id: 'soilMoisture1',
        name: 'Soil moisture 1',
        type: 'number',
        role: 'value',
        unit: 'cb',
    },
    {
        key: 'moist_soil_2',
        id: 'soilMoisture2',
        name: 'Soil moisture 2',
        type: 'number',
        role: 'value',
        unit: 'cb',
    },
    {
        key: 'moist_soil_3',
        id: 'soilMoisture3',
        name: 'Soil moisture 3',
        type: 'number',
        role: 'value',
        unit: 'cb',
    },
    {
        key: 'moist_soil_4',
        id: 'soilMoisture4',
        name: 'Soil moisture 4',
        type: 'number',
        role: 'value',
        unit: 'cb',
    },
    { key: 'wet_leaf_1', id: 'leafWetness1', name: 'Leaf wetness 1', type: 'number', role: 'value' },
    { key: 'wet_leaf_2', id: 'leafWetness2', name: 'Leaf wetness 2', type: 'number', role: 'value' },
    {
        key: 'trans_battery_flag',
        id: 'lowBattery',
        name: 'Transmitter battery low',
        type: 'boolean',
        role: 'indicator.lowbat',
    },
];

const BAR_FIELDS: FieldDefinition<LssBarCondition>[] = [
    {
        key: 'bar_sea_level',
        id: 'seaLevel',
        name: 'Barometer (sea level)',
        type: 'number',
        role: 'value.pressure',
        unitKind: 'pressure',
        trackMinMax: true,
    },
    {
        key: 'bar_absolute',
        id: 'absolute',
        name: 'Barometer (absolute)',
        type: 'number',
        role: 'value.pressure',
        unitKind: 'pressure',
    },
    {
        key: 'bar_trend',
        id: 'trend',
        name: 'Barometer trend (3h)',
        type: 'number',
        role: 'value.pressure',
        unitKind: 'pressure',
    },
];

const INSIDE_FIELDS: FieldDefinition<LssTempHumCondition>[] = [
    {
        key: 'temp_in',
        id: 'temperature',
        name: 'Inside temperature',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
        trackMinMax: true,
    },
    {
        key: 'hum_in',
        id: 'humidity',
        name: 'Inside humidity',
        type: 'number',
        role: 'value.humidity',
        unit: '%',
        trackMinMax: true,
    },
    {
        key: 'dew_point_in',
        id: 'dewPoint',
        name: 'Inside dew point',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
    },
    {
        key: 'heat_index_in',
        id: 'heatIndex',
        name: 'Inside heat index',
        type: 'number',
        role: 'value.temperature',
        unitKind: 'temperature',
    },
];

/** Fields that are updated by the real-time UDP broadcast (subset of ISS fields) */
const REALTIME_ISS_FIELDS: { key: string; id: string; unitKind?: UnitKind; isRain?: boolean; isRainRate?: boolean }[] =
    [
        { key: 'wind_speed_last', id: 'windSpeedLast', unitKind: 'windSpeed' },
        { key: 'wind_dir_last', id: 'windDirLast' },
        { key: 'rain_rate_last', id: 'rainRateLast', isRain: true, isRainRate: true },
        { key: 'rainfall_daily', id: 'rainfallDaily', isRain: true },
        { key: 'rainfall_monthly', id: 'rainfallMonthly', isRain: true },
        { key: 'rainfall_year', id: 'rainfallYear', isRain: true },
        { key: 'wind_speed_hi_last_10_min', id: 'windSpeedHi10Min', unitKind: 'windSpeed' },
    ];

const HTTP_TIMEOUT_MS = 8000;
const REALTIME_UDP_PORT = 22222;
/** Renew the real-time broadcast request this many seconds before it expires */
const REALTIME_RENEW_MARGIN_S = 15;
/** Number of consecutive failed real-time activation attempts before a warning is logged, instead of just a debug message */
const REALTIME_ACTIVATION_WARN_THRESHOLD = 3;
/** Maximum number of transmitters a WeatherLink Live can track (txid range 1..8, plus 0 as a defensive fallback) */
const MAX_TRANSMITTER_ID = 8;
/** Time window over which solar radiation readings are averaged before being used for the cloud cover calculation */
const SOLAR_RAD_SMOOTHING_WINDOW_MS = 5 * 60 * 1000;
/** Rolling time window over which the wind direction "opening angle" (angular spread) is continuously recomputed */
const DIRECTION_SPREAD_WINDOW_MS = 5 * 60 * 1000;

/**
 * Validates that a value is a plausible transmitter ID before it is used to build an ioBroker object ID.
 *
 * @param txid - The raw (untrusted) transmitter ID from the API/broadcast payload
 * @returns The validated transmitter ID, or `undefined` if it is not a plausible value
 */
function validateTxId(txid: unknown): number | undefined {
    if (typeof txid !== 'number' || !Number.isInteger(txid) || txid < 0 || txid > MAX_TRANSMITTER_ID) {
        return undefined;
    }
    return txid;
}

/** The four min/max tracker periods maintained for each `trackMinMax` field, see `lib/minmax.ts` */
const MIN_MAX_PERIODS = ['day', 'month', 'year', 'absolute'] as const;

/**
 * Capitalizes the first letter of a word, used to build tracker state ID suffixes like
 * `DayMin`/`AbsoluteMax` from the lowercase period/extreme identifiers.
 *
 * @param word - The word to capitalize
 * @returns The word with its first letter upper-cased
 */
function capitalize(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

class Davis extends utils.Adapter {
    private pollTimer: ReturnType<typeof this.setInterval> | undefined;
    private realtimeRenewTimer: ReturnType<typeof this.setTimeout> | undefined;
    /** Number of consecutive failed real-time activation attempts, used to avoid logging a warning for every transient blip */
    private realtimeActivationFailures = 0;
    private udpSocket: dgram.Socket | undefined;
    private readonly knownChannels = new Set<string>();
    private readonly knownStates = new Set<string>();
    private isConnected = false;
    /** Site-learned clear-sky reference for the solar cloud cover model, persisted across restarts */
    private clearSkyReference: ClearSkyReferenceMap = {};
    /** Recent solar radiation readings, used to smooth out momentary dips (e.g. a passing cloud shadow) */
    private solarRadSamples: TimedSample[] = [];
    private units: UnitSystem = 'imperial';
    /** In-memory cache of the day/month/year/absolute min/max tracker state for each `trackMinMax` field, keyed by its state ID; lazily reloaded from persisted states on first use after a restart */
    private readonly minMaxCache = new Map<string, MinMaxState | undefined>();
    /** In-memory rolling window of recent wind direction readings for each `directionSpread5Min` field, keyed by its state ID, used to continuously recompute the 5-minute angular spread */
    private readonly windDirSpreadSamples = new Map<string, TimedSample[]>();

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'davis',
            // Populates this.latitude/this.longitude from ioBroker's system-wide location setting
            useFormatDate: true,
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.on('message', this.onMessage.bind(this));
    }

    private async onReady(): Promise<void> {
        this.units = this.config.units === 'metric' ? 'metric' : 'imperial';

        if (!this.hasValidLocation()) {
            this.log.info(
                'No latitude/longitude configured in the ioBroker system settings (Hauptseite -> Einstellungen); ' +
                    'solar-based cloud cover and day/night icon detection will be disabled.',
            );
        }

        await this.setObjectNotExistsAsync('info', {
            type: 'channel',
            common: { name: 'Information' },
            native: {},
        });
        await this.setObjectNotExistsAsync('info.connection', {
            type: 'state',
            common: {
                name: 'Connection to WeatherLink Live established',
                type: 'boolean',
                role: 'indicator.connected',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensors', {
            type: 'channel',
            common: { name: 'Sensors' },
            native: {},
        });
        await this.setObjectNotExistsAsync('calculated', {
            type: 'channel',
            common: { name: 'Calculated values' },
            native: {},
        });
        await this.setObjectNotExistsAsync('calculated.clearSkyReference', {
            type: 'state',
            common: {
                name: 'Learned clear-sky solar radiation reference (internal, per sun elevation)',
                type: 'string',
                role: 'json',
                read: true,
                write: false,
            },
            native: {},
        });
        const clearSkyState = await this.getStateAsync('calculated.clearSkyReference');
        if (typeof clearSkyState?.val === 'string') {
            try {
                this.clearSkyReference = JSON.parse(clearSkyState.val);
            } catch {
                this.log.debug('Could not parse persisted clear-sky reference data, starting fresh.');
            }
        }

        if (!this.config.host) {
            this.log.error('No WeatherLink Live 6100 IP address configured. Please configure the adapter instance.');
            await this.setConnected(false);
            return;
        }

        const pollIntervalMs = Math.max(10, Number(this.config.pollInterval) || 20) * 1000;

        // Do an initial poll immediately, then continue on the configured interval
        await this.poll();
        this.pollTimer = this.setInterval(() => {
            void this.poll();
        }, pollIntervalMs);

        if (this.config.realtimeEnabled) {
            await this.startRealtime();
        }
    }

    /**
     * Build the base URL for the WeatherLink Live Local API.
     */
    private get baseUrl(): string {
        const port = Number(this.config.port) || 80;
        return `http://${this.config.host}:${port}`;
    }

    private async setConnected(connected: boolean): Promise<void> {
        if (this.isConnected !== connected) {
            this.isConnected = connected;
            await this.setStateAsync('info.connection', { val: connected, ack: true });
        }
    }

    private async fetchJson<T>(url: string): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return (await response.json()) as T;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Polls /v1/current_conditions and updates all states.
     */
    private async poll(): Promise<void> {
        try {
            const response = await this.fetchJson<CurrentConditionsResponse>(`${this.baseUrl}/v1/current_conditions`);

            if (!response.data || response.error) {
                throw new Error(response.error?.message ?? 'Empty response from WeatherLink Live');
            }

            for (const condition of response.data.conditions) {
                await this.processCondition(condition);
            }
            await this.updateCloudCover(response.data.conditions);
            await this.updateWeatherIcon(response.data.conditions);
            await this.updateEvapotranspiration(response.data.conditions);

            await this.setConnected(true);
        } catch (error) {
            this.log.error(`Polling WeatherLink Live 6100 failed: ${(error as Error).message}`);
            await this.setConnected(false);
        }
    }

    /**
     * Dispatches a single condition record to the matching channel/field handler.
     * Different stations report a different set (and count) of records here,
     * depending on which transmitters/sensors are configured.
     *
     * @param condition - Raw condition record from the API/broadcast response
     */
    private async processCondition(condition: Condition): Promise<void> {
        switch (condition.data_structure_type) {
            case DataStructureType.ISS: {
                const txid = validateTxId(condition.txid);
                if (txid === undefined) {
                    this.log.debug(`Ignoring ISS condition with implausible txid: ${JSON.stringify(condition.txid)}`);
                    break;
                }
                await this.updateChannel(`sensors.tx${txid}`, `Transmitter ${txid} (ISS)`, ISS_FIELDS, condition);
                break;
            }
            case DataStructureType.LeafSoil: {
                const txid = validateTxId(condition.txid);
                if (txid === undefined) {
                    this.log.debug(
                        `Ignoring Leaf/Soil condition with implausible txid: ${JSON.stringify(condition.txid)}`,
                    );
                    break;
                }
                await this.updateChannel(
                    `sensors.soilLeaf${txid}`,
                    `Transmitter ${txid} (Leaf/Soil)`,
                    LEAF_SOIL_FIELDS,
                    condition,
                );
                break;
            }
            case DataStructureType.LssBar:
                await this.updateChannel('sensors.barometer', 'Barometer', BAR_FIELDS, condition);
                break;
            case DataStructureType.LssTempHum:
                await this.updateChannel('sensors.inside', 'Inside sensor', INSIDE_FIELDS, condition);
                break;
            default:
                this.log.debug(`Unknown data_structure_type: ${JSON.stringify(condition)}`);
        }
    }

    /**
     * Estimates the cloud cover from the current poll's condition records and writes it to
     * `calculated.cloudCover` / `calculated.cloudCoverModel`, using whichever model the currently
     * installed sensors support:
     * - Model A ("solar"): from solar radiation + sun elevation, if a solar sensor and this
     *   adapter's configured latitude/longitude are available and the sun is high enough.
     * - Model B ("heuristic" / "heuristic+pressure"): from the dew point depression, optionally
     *   refined with the barometric pressure trend if a barometer channel is present.
     * If neither model has the sensors it needs, no state is created/updated at all.
     *
     * @param conditions - All condition records from the current poll
     */
    private async updateCloudCover(conditions: Condition[]): Promise<void> {
        const iss = conditions.find((c): c is IssCondition => c.data_structure_type === DataStructureType.ISS);
        const barometer = conditions.find(
            (c): c is LssBarCondition => c.data_structure_type === DataStructureType.LssBar,
        );

        let result: { percent: number; model: CloudCoverModel } | undefined;

        if (iss?.solar_rad !== null && iss?.solar_rad !== undefined && this.hasValidLocation()) {
            const elevationDeg = getSolarElevationDeg(new Date(), this.latitude!, this.longitude!);
            const now = Date.now();
            if (elevationDeg > 0) {
                // The clear-sky reference is calibrated from the raw (unsmoothed) reading, so a
                // brief genuinely-clear moment can still be recorded as the true peak for its bucket.
                this.clearSkyReference = recordObservation(this.clearSkyReference, elevationDeg, iss.solar_rad, now);
                await this.persistClearSkyReference();
            }
            // The value fed into the cloud cover calculation itself is smoothed over a short time
            // window, so a single momentary dip (e.g. a small cloud passing in front of the sun for
            // under a minute) doesn't swing the reported cloud cover by tens of percentage points.
            const { samples, average: smoothedSolarRad } = addSample(
                this.solarRadSamples,
                iss.solar_rad,
                now,
                SOLAR_RAD_SMOOTHING_WINDOW_MS,
            );
            this.solarRadSamples = samples;
            const learnedClearSky = getReference(this.clearSkyReference, elevationDeg, now);
            const percent = computeCloudCoverSolar(smoothedSolarRad, elevationDeg, learnedClearSky);
            if (percent !== undefined) {
                result = { percent, model: 'solar' };
            }
        }

        if (
            !result &&
            iss?.temp !== null &&
            iss?.temp !== undefined &&
            iss?.dew_point !== null &&
            iss?.dew_point !== undefined
        ) {
            // The Local API always reports temp/dew_point in °F and bar_trend in inHg, but the
            // heuristic's thresholds are calibrated in °C / hPa - convert (independently of the
            // user's display unit setting, which only affects what gets shown in the states).
            const tempC = convertValue(iss.temp, 'temperature', 'metric');
            const dewPointC = convertValue(iss.dew_point, 'temperature', 'metric');
            const barTrendHpa =
                barometer?.bar_trend !== null && barometer?.bar_trend !== undefined
                    ? convertValue(barometer.bar_trend, 'pressure', 'metric')
                    : undefined;
            result = computeCloudCoverHeuristic(tempC, dewPointC, barTrendHpa);
        }

        if (!result) {
            // Neither model has the sensors it needs for this poll (e.g. no ISS data at all yet,
            // or solar sensor present but sun too low and no dew point available as fallback).
            return;
        }

        if (!this.knownChannels.has('calculated.cloudCover')) {
            await this.setObjectNotExistsAsync('calculated.cloudCover', {
                type: 'state',
                common: {
                    name: 'Estimated cloud cover',
                    type: 'number',
                    role: 'value',
                    unit: '%',
                    min: 0,
                    max: 100,
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.setObjectNotExistsAsync('calculated.cloudCoverModel', {
                type: 'state',
                common: {
                    name: 'Cloud cover estimation model used',
                    type: 'string',
                    role: 'text',
                    states: {
                        solar: 'Solar radiation (clear-sky index)',
                        heuristic: 'Dew point depression (rough estimate)',
                        'heuristic+pressure': 'Dew point depression + pressure trend (rough estimate)',
                    },
                    read: true,
                    write: false,
                },
                native: {},
            });
            this.knownChannels.add('calculated.cloudCover');
        }

        await this.setStateAsync('calculated.cloudCover', { val: result.percent, ack: true });
        await this.setStateAsync('calculated.cloudCoverModel', { val: result.model, ack: true });
    }

    /**
     * Estimates a simplified current-weather icon/condition from the same poll's condition
     * records, reusing the cloud cover estimate (if any) computed just before this is called.
     * Creates no state at all if neither cloud cover nor an active rain sensor is available.
     *
     * @param conditions - All condition records from the current poll
     */
    private async updateWeatherIcon(conditions: Condition[]): Promise<void> {
        const iss = conditions.find((c): c is IssCondition => c.data_structure_type === DataStructureType.ISS);
        if (!iss) {
            return;
        }
        const barometer = conditions.find(
            (c): c is LssBarCondition => c.data_structure_type === DataStructureType.LssBar,
        );

        const cloudCoverState = await this.getStateAsync('calculated.cloudCover');
        const cloudCoverPercent =
            typeof cloudCoverState?.val === 'number' && cloudCoverState.ack ? cloudCoverState.val : undefined;

        const tempC =
            iss.temp !== null && iss.temp !== undefined ? convertValue(iss.temp, 'temperature', 'metric') : undefined;
        const dewPointC =
            iss.dew_point !== null && iss.dew_point !== undefined
                ? convertValue(iss.dew_point, 'temperature', 'metric')
                : undefined;
        const dewPointDepressionC = tempC !== undefined && dewPointC !== undefined ? tempC - dewPointC : undefined;
        const windSpeedKmh =
            iss.wind_speed_last !== null && iss.wind_speed_last !== undefined
                ? convertValue(iss.wind_speed_last, 'windSpeed', 'metric')
                : undefined;
        const windGustKmh =
            iss.wind_speed_hi_last_2_min !== null && iss.wind_speed_hi_last_2_min !== undefined
                ? convertValue(iss.wind_speed_hi_last_2_min, 'windSpeed', 'metric')
                : undefined;
        const windAvgKmh =
            iss.wind_speed_avg_last_10_min !== null && iss.wind_speed_avg_last_10_min !== undefined
                ? convertValue(iss.wind_speed_avg_last_10_min, 'windSpeed', 'metric')
                : undefined;
        const barTrendHpa =
            barometer?.bar_trend !== null && barometer?.bar_trend !== undefined
                ? convertValue(barometer.bar_trend, 'pressure', 'metric')
                : undefined;
        const rainRateMmh =
            iss.rain_rate_last !== null && iss.rain_rate_last !== undefined
                ? convertRainCount(iss.rain_rate_last, iss.rain_size, 'metric')
                : undefined;

        const elevationDeg = this.hasValidLocation()
            ? getSolarElevationDeg(new Date(), this.latitude!, this.longitude!)
            : undefined;
        // Fall back to "is the sun above the horizon right now" only when we have a location;
        // without one, assume daytime icons (a rough default, since we cannot know better).
        const isDay = elevationDeg === undefined || elevationDeg > 0;

        const result = computeWeatherIcon({
            cloudCoverPercent,
            rainRateLast: rainRateMmh,
            tempC,
            dewPointDepressionC,
            windSpeed: windSpeedKmh,
            windGustKmh,
            windAvgKmh,
            barTrendHpa,
            isDay,
        });

        if (!result) {
            return;
        }

        if (!this.knownChannels.has('calculated.weatherCode')) {
            await this.setObjectNotExistsAsync('calculated.weatherCode', {
                type: 'state',
                common: {
                    name: 'Weather condition code (WMO-inspired)',
                    type: 'number',
                    role: 'value',
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.setObjectNotExistsAsync('calculated.weatherState', {
                type: 'state',
                common: {
                    name: 'Weather condition',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.setObjectNotExistsAsync('calculated.weatherIcon', {
                type: 'state',
                common: {
                    name: 'Weather icon path',
                    type: 'string',
                    role: 'text.url',
                    read: true,
                    write: false,
                },
                native: {},
            });
            this.knownChannels.add('calculated.weatherCode');
        }

        await this.setStateAsync('calculated.weatherCode', { val: result.code, ack: true });
        await this.setStateAsync('calculated.weatherState', { val: result.state, ack: true });
        await this.setStateAsync('calculated.weatherIcon', {
            val: `/adapter/${this.name}/${result.iconPath}`,
            ack: true,
        });
    }

    /**
     * Estimates the reference evapotranspiration (ETo) for the current day using the
     * Hargreaves-Samani equation (see `lib/evapotranspiration.ts`), from today's tracked
     * minimum/maximum outside temperature (see `trackMinMax` on the ISS temperature field) and
     * the station's latitude. Creates no state until a location is configured and at least one
     * temperature reading has been recorded for today (so a real, if still growing, diurnal
     * range is available) - the estimate naturally becomes more accurate as the day progresses
     * and the temperature range widens towards its actual daily min/max.
     *
     * @param conditions - All condition records from the current poll
     */
    private async updateEvapotranspiration(conditions: Condition[]): Promise<void> {
        if (!this.hasValidLocation()) {
            return;
        }
        const iss = conditions.find((c): c is IssCondition => c.data_structure_type === DataStructureType.ISS);
        const txid = validateTxId(iss?.txid);
        if (txid === undefined) {
            return;
        }

        const temperatureState = this.minMaxCache.get(`sensors.tx${txid}.temperature`);
        const tempMin = temperatureState?.day.min?.value;
        const tempMax = temperatureState?.day.max?.value;
        if (tempMin === undefined || tempMax === undefined) {
            // No temperature reading recorded for today yet (e.g. right after a restart, before
            // the ISS temperature field has been processed at least once this poll cycle).
            return;
        }
        // The min/max tracker stores values in the user's configured display unit, but the
        // Hargreaves-Samani thresholds are calibrated in °C - convert independently of `this.units`.
        const toCelsius = (fahrenheitOrCelsius: number): number =>
            this.units === 'imperial' ? ((fahrenheitOrCelsius - 32) * 5) / 9 : fahrenheitOrCelsius;
        const tempMinC = toCelsius(tempMin);
        const tempMaxC = toCelsius(tempMax);

        const eto = computeEvapotranspiration(tempMinC, tempMaxC, this.latitude!, new Date());
        if (eto === undefined) {
            return;
        }

        if (!this.knownStates.has('calculated.evapotranspiration')) {
            await this.setObjectNotExistsAsync('calculated.evapotranspiration', {
                type: 'state',
                common: {
                    name: 'Estimated reference evapotranspiration (ETo, today)',
                    type: 'number',
                    role: 'value',
                    unit: 'mm/d',
                    read: true,
                    write: false,
                },
                native: {},
            });
            this.knownStates.add('calculated.evapotranspiration');
        }
        await this.setStateAsync('calculated.evapotranspiration', { val: Math.round(eto * 100) / 100, ack: true });
    }

    /**
     * Persists the current learned clear-sky reference map so it survives adapter restarts.
     */
    private async persistClearSkyReference(): Promise<void> {
        await this.setStateAsync('calculated.clearSkyReference', {
            val: JSON.stringify(this.clearSkyReference),
            ack: true,
        });
    }

    /**
     * Checks whether a usable latitude/longitude is available (required for Model A / day-night
     * detection). The coordinates come from ioBroker's system-wide location setting
     * (`system.config`), not from this adapter's own configuration.
     *
     * @returns `true` if both coordinates were found and are within their valid ranges
     */
    private hasValidLocation(): boolean {
        const lat = this.latitude;
        const lon = this.longitude;
        return (
            lat !== undefined &&
            lon !== undefined &&
            Number.isFinite(lat) &&
            Number.isFinite(lon) &&
            !(lat === 0 && lon === 0) &&
            Math.abs(lat) <= 90 &&
            Math.abs(lon) <= 180
        );
    }

    /**
     * Creates the channel (if new) and all states for the fields that are
     * actually present in the payload, then updates their values.
     * Only fields present in the current record are created, so the object
     * tree automatically adapts to the sensors actually installed on this station.
     *
     * @param channelId - Object ID of the channel, relative to the adapter namespace
     * @param channelName - Display name for the channel
     * @param fields - Field definitions describing which record properties map to which states
     * @param record - The raw condition record containing the current values
     */
    private async updateChannel<T>(
        channelId: string,
        channelName: string,
        fields: FieldDefinition<T>[],
        record: T,
    ): Promise<void> {
        if (!this.knownChannels.has(channelId)) {
            await this.setObjectNotExistsAsync(channelId, {
                type: 'channel',
                common: { name: channelName },
                native: {},
            });
            this.knownChannels.add(channelId);
        }

        for (const field of fields) {
            if (!(field.key in (record as object))) {
                // This station/transmitter configuration does not report this field at all
                continue;
            }
            const value = record[field.key] as unknown as number | boolean | null | undefined;
            const stateId = `${channelId}.${field.id}`;
            const unit = field.isRain
                ? getRainUnitLabel(this.units, field.isRainRate)
                : field.unitKind
                  ? getUnitLabel(field.unitKind, this.units)
                  : field.unit;

            if (!this.knownStates.has(stateId)) {
                await this.setObjectNotExistsAsync(stateId, {
                    type: 'state',
                    common: {
                        name: field.name,
                        type: field.type,
                        role: field.role,
                        unit,
                        states: field.states,
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                // Keep the unit in sync with the current setting even if the object already
                // existed from a previous run with a different unit system selected.
                await this.extendObjectAsync(stateId, { common: { unit } });
                this.knownStates.add(stateId);
            }

            const compassStateId = `${stateId}Text`;
            if (field.compassText && !this.knownStates.has(compassStateId)) {
                await this.setObjectNotExistsAsync(compassStateId, {
                    type: 'state',
                    common: {
                        name: `${field.name} (compass)`,
                        type: 'string',
                        role: 'text',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                this.knownStates.add(compassStateId);
            }

            const uvRiskStateId = `${stateId}Text`;
            if (field.uvRiskText && !this.knownStates.has(uvRiskStateId)) {
                await this.setObjectNotExistsAsync(uvRiskStateId, {
                    type: 'state',
                    common: {
                        name: `${field.name} (risk category)`,
                        type: 'string',
                        role: 'text',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                this.knownStates.add(uvRiskStateId);
            }

            const rainIntensityStateId = `${stateId}Text`;
            if (field.rainIntensityText && !this.knownStates.has(rainIntensityStateId)) {
                await this.setObjectNotExistsAsync(rainIntensityStateId, {
                    type: 'state',
                    common: {
                        name: `${field.name} (intensity category)`,
                        type: 'string',
                        role: 'text',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                this.knownStates.add(rainIntensityStateId);
            }

            const frostWarningStateId = `${stateId}FrostWarning`;
            if (field.frostWarning && !this.knownStates.has(frostWarningStateId)) {
                await this.setObjectNotExistsAsync(frostWarningStateId, {
                    type: 'state',
                    common: {
                        name: `${field.name} (frost warning)`,
                        type: 'boolean',
                        role: 'indicator',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                this.knownStates.add(frostWarningStateId);
            }

            const heatRiskStateId = `${stateId}Text`;
            if (field.heatRiskText && !this.knownStates.has(heatRiskStateId)) {
                await this.setObjectNotExistsAsync(heatRiskStateId, {
                    type: 'state',
                    common: {
                        name: `${field.name} (risk category)`,
                        type: 'string',
                        role: 'text',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                this.knownStates.add(heatRiskStateId);
            }

            const dewPointComfortStateId = `${stateId}Text`;
            if (field.dewPointComfortText && !this.knownStates.has(dewPointComfortStateId)) {
                await this.setObjectNotExistsAsync(dewPointComfortStateId, {
                    type: 'state',
                    common: {
                        name: `${field.name} (comfort category)`,
                        type: 'string',
                        role: 'text',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                this.knownStates.add(dewPointComfortStateId);
            }

            if (value === null || value === undefined) {
                // Sensor exists but currently has no valid reading; keep last known value
                continue;
            }

            const rainSize = (record as unknown as { rain_size?: number | null }).rain_size;
            const val =
                field.type === 'boolean'
                    ? Boolean(value)
                    : field.isTimestamp
                      ? new Date(Number(value) * 1000).toISOString()
                      : field.isRain
                        ? convertRainCount(Number(value), rainSize, this.units)
                        : field.unitKind
                          ? convertValue(Number(value), field.unitKind, this.units)
                          : Number(value);
            await this.setStateAsync(stateId, { val, ack: true });

            if (field.compassText) {
                await this.setStateAsync(compassStateId, { val: getCompassDirection(Number(value)), ack: true });
            }
            if (field.directionSpread5Min) {
                await this.updateDirectionSpread(stateId, field.name, Number(value));
            }
            if (field.uvRiskText) {
                await this.setStateAsync(uvRiskStateId, { val: getUvRiskLevelLabel(Number(value)), ack: true });
            }
            if (field.rainIntensityText) {
                // Classification thresholds are calibrated in mm/h, independent of the user's
                // display unit setting, so always convert to metric for this regardless of `this.units`.
                const rateMmh = convertRainCount(Number(value), rainSize, 'metric');
                await this.setStateAsync(rainIntensityStateId, {
                    val: getRainIntensityLevelLabel(rateMmh),
                    ack: true,
                });
            }
            if (field.frostWarning) {
                // Frost threshold is calibrated in °C, independent of the user's display unit setting.
                const tempC = convertValue(Number(value), 'temperature', 'metric');
                await this.setStateAsync(frostWarningStateId, { val: isFrostRisk(tempC), ack: true });
            }
            if (field.heatRiskText) {
                // Heat risk thresholds are calibrated in °C, independent of the user's display unit setting.
                const heatIndexC = convertValue(Number(value), 'temperature', 'metric');
                await this.setStateAsync(heatRiskStateId, { val: getHeatRiskLevelLabel(heatIndexC), ack: true });
            }
            if (field.dewPointComfortText) {
                // Comfort thresholds are calibrated in °C, independent of the user's display unit setting.
                const dewPointC = convertValue(Number(value), 'temperature', 'metric');
                await this.setStateAsync(dewPointComfortStateId, {
                    val: getDewPointComfortLevelLabel(dewPointC),
                    ack: true,
                });
            }
            if (field.trackMinMax && typeof val === 'number') {
                await this.updateFieldMinMax(stateId, field.name, val);
            }
        }
    }

    /**
     * Updates the day/month/year/absolute min/max tracker for one field with a newly measured
     * value, creating the tracker states on first use and persisting/reloading them across
     * adapter restarts (see `lib/minmax.ts` for the rollover logic itself).
     *
     * @param stateId - Object ID of the underlying value state (relative to the adapter namespace)
     * @param fieldName - Display name of the underlying field, used to build the tracker state names
     * @param value - The newly measured value, already converted to the current display unit
     */
    private async updateFieldMinMax(stateId: string, fieldName: string, value: number): Promise<void> {
        if (!this.minMaxCache.has(stateId)) {
            this.minMaxCache.set(stateId, await this.loadMinMaxState(stateId));
        }
        const previous = this.minMaxCache.get(stateId);
        const updated = updateMinMax(previous, value, new Date());
        this.minMaxCache.set(stateId, updated);

        await this.ensureMinMaxObjects(stateId, fieldName);

        for (const period of MIN_MAX_PERIODS) {
            for (const extreme of ['min', 'max'] as const) {
                const previousEntry = previous?.[period][extreme];
                const newEntry = updated[period][extreme];
                if (!newEntry || (previousEntry && previousEntry.timestamp === newEntry.timestamp)) {
                    // No new extreme was recorded for this period/extreme combination this poll.
                    continue;
                }
                const suffix = `${capitalize(period)}${capitalize(extreme)}`;
                await this.setStateAsync(`${stateId}${suffix}`, { val: newEntry.value, ack: true });
                await this.setStateAsync(`${stateId}${suffix}Time`, {
                    val: new Date(newEntry.timestamp).toISOString(),
                    ack: true,
                });
            }
        }
    }

    /**
     * Creates the 16 min/max tracker states (day/month/year/absolute × min/max × value/time) for
     * one field, if they don't already exist.
     *
     * @param stateId - Object ID of the underlying value state (relative to the adapter namespace)
     * @param fieldName - Display name of the underlying field, used to build the tracker state names
     */
    private async ensureMinMaxObjects(stateId: string, fieldName: string): Promise<void> {
        const marker = `${stateId}DayMin`;
        if (this.knownStates.has(marker)) {
            return;
        }
        const periodLabels: Record<(typeof MIN_MAX_PERIODS)[number], string> = {
            day: 'today',
            month: 'this month',
            year: 'this year',
            absolute: 'ever',
        };
        for (const period of MIN_MAX_PERIODS) {
            for (const extreme of ['min', 'max'] as const) {
                const suffix = `${capitalize(period)}${capitalize(extreme)}`;
                const valueStateId = `${stateId}${suffix}`;
                const timeStateId = `${valueStateId}Time`;
                const extremeLabel = extreme === 'min' ? 'minimum' : 'maximum';
                await this.setObjectNotExistsAsync(valueStateId, {
                    type: 'state',
                    common: {
                        name: `${fieldName} (${extremeLabel} ${periodLabels[period]})`,
                        type: 'number',
                        role: 'value',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                await this.setObjectNotExistsAsync(timeStateId, {
                    type: 'state',
                    common: {
                        name: `${fieldName} (${extremeLabel} ${periodLabels[period]}, timestamp)`,
                        type: 'string',
                        role: 'date',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
            }
        }
        this.knownStates.add(marker);
    }

    /**
     * Reconstructs a field's persisted min/max tracker state from its ioBroker states after an
     * adapter restart, so day/month/year/absolute extremes aren't lost across restarts. Returns
     * `undefined` if no tracker states exist yet for this field (first run).
     *
     * @param stateId - Object ID of the underlying value state (relative to the adapter namespace)
     * @returns The reconstructed tracker state, or `undefined` if nothing was persisted yet
     */
    private async loadMinMaxState(stateId: string): Promise<MinMaxState | undefined> {
        const result: Partial<MinMaxState> = {};
        let foundAny = false;
        for (const period of MIN_MAX_PERIODS) {
            const bucket: MinMaxState['day'] = {};
            for (const extreme of ['min', 'max'] as const) {
                const suffix = `${capitalize(period)}${capitalize(extreme)}`;
                const valueState = await this.getStateAsync(`${stateId}${suffix}`);
                const timeState = await this.getStateAsync(`${stateId}${suffix}Time`);
                if (typeof valueState?.val === 'number' && typeof timeState?.val === 'string') {
                    const timestamp = new Date(timeState.val).getTime();
                    if (Number.isFinite(timestamp)) {
                        bucket[extreme] = { value: valueState.val, timestamp };
                        foundAny = true;
                    }
                }
            }
            result[period] = bucket;
        }
        return foundAny ? (result as MinMaxState) : undefined;
    }

    /**
     * Updates the continuously-recomputed 5-minute wind direction "opening angle" (angular
     * spread) for one field with a newly measured direction reading. Unlike the day/month/year
     * min/max trackers, this rolling window is purely in-memory and not persisted across
     * restarts - after a restart it simply starts accumulating readings again from scratch,
     * which is appropriate since it is only meant to reflect the last 5 minutes anyway.
     *
     * @param stateId - Object ID of the underlying wind direction state (relative to the adapter namespace)
     * @param fieldName - Display name of the underlying field, used to build the tracker state name
     * @param directionDeg - The newly measured wind direction, in degrees
     */
    private async updateDirectionSpread(stateId: string, fieldName: string, directionDeg: number): Promise<void> {
        const previousSamples = this.windDirSpreadSamples.get(stateId) ?? [];
        const { samples } = addSample(previousSamples, directionDeg, Date.now(), DIRECTION_SPREAD_WINDOW_MS);
        this.windDirSpreadSamples.set(stateId, samples);

        const spread = computeDirectionSpread(samples.map(s => s.value));
        if (spread === undefined) {
            return;
        }

        const spreadStateId = `${stateId}Spread5Min`;
        if (!this.knownStates.has(spreadStateId)) {
            await this.setObjectNotExistsAsync(spreadStateId, {
                type: 'state',
                common: {
                    name: `${fieldName} (5-min opening angle)`,
                    type: 'number',
                    role: 'value.direction.wind',
                    unit: '°',
                    read: true,
                    write: false,
                },
                native: {},
            });
            this.knownStates.add(spreadStateId);
        }
        await this.setStateAsync(spreadStateId, { val: Math.round(spread * 10) / 10, ack: true });
    }

    /**
     * Activates the real-time UDP broadcast on the WeatherLink Live and starts
     * listening for broadcast packets on port 22222. Renews the broadcast
     * before it expires so the real-time stream stays alive continuously.
     */
    private async startRealtime(): Promise<void> {
        this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        this.udpSocket.on('message', (msg, rinfo) => {
            if (rinfo.address !== this.config.host) {
                this.log.debug(`Ignoring real-time UDP packet from unexpected sender ${rinfo.address}`);
                return;
            }
            this.handleRealtimePacket(msg);
        });

        this.udpSocket.on('error', error => {
            this.log.error(`Real-time UDP socket error: ${error.message}`);
        });

        try {
            await new Promise<void>((resolve, reject) => {
                this.udpSocket!.once('error', reject);
                this.udpSocket!.bind(REALTIME_UDP_PORT, () => {
                    this.udpSocket!.removeListener('error', reject);
                    resolve();
                });
            });
        } catch (error) {
            this.log.error(`Could not bind real-time UDP socket: ${(error as Error).message}`);
            this.udpSocket.close();
            this.udpSocket = undefined;
            return;
        }

        await this.activateRealtime();
    }

    /**
     * Sends the HTTP request that (re-)activates the UDP broadcast, then
     * schedules the next renewal shortly before the granted duration expires.
     */
    private async activateRealtime(): Promise<void> {
        const requestedDuration = Math.min(86400, Math.max(20, Number(this.config.realtimeDuration) || 90));
        try {
            const response = await this.fetchJson<RealTimeActivationResponse>(
                `${this.baseUrl}/v1/real_time?duration=${requestedDuration}`,
            );

            if (!response.data || response.error) {
                throw new Error(response.error?.message ?? 'Empty response activating real-time broadcast');
            }

            const grantedDuration = response.data.duration;
            this.log.debug(
                `Real-time broadcast active for ${grantedDuration}s on port ${response.data.broadcast_port}`,
            );
            this.realtimeActivationFailures = 0;

            const renewInMs = Math.max(5, grantedDuration - REALTIME_RENEW_MARGIN_S) * 1000;
            this.realtimeRenewTimer = this.setTimeout(() => {
                void this.activateRealtime();
            }, renewInMs);
        } catch (error) {
            this.realtimeActivationFailures++;
            const message = `Could not activate real-time broadcast, retrying in 30s: ${(error as Error).message}`;
            if (this.realtimeActivationFailures >= REALTIME_ACTIVATION_WARN_THRESHOLD) {
                this.log.warn(`${message} (failed ${this.realtimeActivationFailures} times in a row)`);
            } else {
                this.log.debug(message);
            }
            this.realtimeRenewTimer = this.setTimeout(() => {
                void this.activateRealtime();
            }, 30000);
        }
    }

    /**
     * Parses and applies an incoming UDP real-time broadcast packet.
     *
     * @param msg - Raw UDP payload received from the WeatherLink Live
     */
    private handleRealtimePacket(msg: Buffer): void {
        let packet: RealtimeBroadcastPacket;
        try {
            packet = JSON.parse(msg.toString('utf8'));
        } catch (error) {
            this.log.debug(`Ignoring malformed real-time UDP packet: ${(error as Error).message}`);
            return;
        }

        if (!packet?.conditions) {
            return;
        }

        for (const record of packet.conditions) {
            if (record.data_structure_type !== 1) {
                continue;
            }
            const txid = validateTxId(record.txid);
            if (txid === undefined) {
                continue;
            }
            const channelId = `sensors.tx${txid}`;
            if (!this.knownChannels.has(channelId)) {
                // Channel not created yet by a regular poll; skip until the next poll cycle creates it
                continue;
            }
            for (const field of REALTIME_ISS_FIELDS) {
                const value = (record as unknown as Record<string, number | null | undefined>)[field.key];
                if (value === null || value === undefined) {
                    continue;
                }
                const val = field.isRain
                    ? convertRainCount(Number(value), record.rain_size, this.units)
                    : field.unitKind
                      ? convertValue(Number(value), field.unitKind, this.units)
                      : Number(value);
                this.setStateAsync(`${channelId}.${field.id}`, { val, ack: true }).catch((error: Error) => {
                    this.log.debug(`Could not update ${channelId}.${field.id}: ${error.message}`);
                });
            }
        }
    }

    /**
     * Handles messages sent to this adapter instance, currently only the
     * "discoverWLL" command used by the "Find WeatherLink Live" button in the admin UI.
     *
     * @param obj - The incoming ioBroker message object
     */
    private async onMessage(obj: ioBroker.Message): Promise<void> {
        if (!obj || typeof obj !== 'object' || !obj.command) {
            return;
        }

        if (obj.command === 'discoverWLL') {
            if (!obj.callback) {
                return;
            }
            try {
                const devices = await discoverWeatherLinkLive();
                if (devices.length === 0) {
                    this.sendTo(obj.from, obj.command, { error: 'notFound' }, obj.callback);
                    return;
                }
                // Use the first device found; most home networks only have a single WeatherLink Live.
                const device = devices[0];
                this.log.info(`Discovered WeatherLink Live 6100 at ${device.address}:${device.port} (${device.name})`);
                this.sendTo(
                    obj.from,
                    obj.command,
                    {
                        native: { host: device.address, port: device.port },
                        result: 'found',
                        args: [device.address],
                    },
                    obj.callback,
                );
            } catch (error) {
                this.log.error(`WeatherLink Live 6100 discovery failed: ${(error as Error).message}`);
                this.sendTo(obj.from, obj.command, { error: 'discoveryFailed' }, obj.callback);
            }
        }
    }

    private onUnload(callback: () => void): void {
        try {
            if (this.pollTimer) {
                this.clearInterval(this.pollTimer);
                this.pollTimer = undefined;
            }
            if (this.realtimeRenewTimer) {
                this.clearTimeout(this.realtimeRenewTimer);
                this.realtimeRenewTimer = undefined;
            }
            if (this.udpSocket) {
                this.udpSocket.close();
                this.udpSocket = undefined;
            }
            callback();
        } catch (error) {
            this.log.error(`Error during unloading: ${(error as Error).message}`);
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Davis(options);
} else {
    (() => new Davis())();
}
