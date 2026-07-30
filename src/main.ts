/*
 * Created with @iobroker/create-adapter v3.1.5
 */

import * as dgram from 'node:dgram';
import * as utils from '@iobroker/adapter-core';
import { computeCloudCoverHeuristic, computeCloudCoverSolar, type CloudCoverModel } from './lib/cloudcover';
import { discoverWeatherLinkLive } from './lib/discovery';
import { getSolarElevationDeg } from './lib/sun';
import { computeWeatherIcon } from './lib/weathericon';
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
    type: 'number' | 'boolean';
    role: string;
    /** Static unit label for fields that are the same in both unit systems (e.g. "%", "W/m²") */
    unit?: string;
    /** For fields whose unit/value depends on the selected unit system (temperature, wind speed, pressure) */
    unitKind?: UnitKind;
    /** Marks a raw rain tip count that must be converted to mm/in using the record's `rain_size` */
    isRain?: boolean;
    /** For rain fields that represent a rate (counts/hour) rather than an accumulated amount */
    isRainRate?: boolean;
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
    },
    { key: 'hum', id: 'humidity', name: 'Humidity', type: 'number', role: 'value.humidity', unit: '%' },
    {
        key: 'dew_point',
        id: 'dewPoint',
        name: 'Dew point',
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
    },
    {
        key: 'wind_dir_last',
        id: 'windDirLast',
        name: 'Wind direction (last)',
        type: 'number',
        role: 'value.direction.wind',
        unit: '°',
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
        key: 'wind_speed_hi_last_10_min',
        id: 'windSpeedHi10Min',
        name: 'Wind gust (10 min)',
        type: 'number',
        role: 'value.speed.wind.max',
        unitKind: 'windSpeed',
    },
    {
        key: 'rain_rate_last',
        id: 'rainRateLast',
        name: 'Rain rate',
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
    { key: 'solar_rad', id: 'solarRad', name: 'Solar radiation', type: 'number', role: 'value', unit: 'W/m²' },
    { key: 'uv_index', id: 'uvIndex', name: 'UV index', type: 'number', role: 'value', unit: 'Index' },
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
        role: 'value.humidity',
        unit: 'cb',
    },
    {
        key: 'moist_soil_2',
        id: 'soilMoisture2',
        name: 'Soil moisture 2',
        type: 'number',
        role: 'value.humidity',
        unit: 'cb',
    },
    {
        key: 'moist_soil_3',
        id: 'soilMoisture3',
        name: 'Soil moisture 3',
        type: 'number',
        role: 'value.humidity',
        unit: 'cb',
    },
    {
        key: 'moist_soil_4',
        id: 'soilMoisture4',
        name: 'Soil moisture 4',
        type: 'number',
        role: 'value.humidity',
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
    },
    { key: 'hum_in', id: 'humidity', name: 'Inside humidity', type: 'number', role: 'value.humidity', unit: '%' },
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
/** Maximum number of transmitters a WeatherLink Live can track (txid range 1..8, plus 0 as a defensive fallback) */
const MAX_TRANSMITTER_ID = 8;

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

class Davis extends utils.Adapter {
    private pollTimer: ReturnType<typeof this.setInterval> | undefined;
    private realtimeRenewTimer: ReturnType<typeof this.setTimeout> | undefined;
    private udpSocket: dgram.Socket | undefined;
    private readonly knownChannels = new Set<string>();
    private readonly knownStates = new Set<string>();
    private isConnected = false;
    private units: UnitSystem = 'imperial';

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

        if (!this.config.host) {
            this.log.error('No WeatherLink Live IP address configured. Please configure the adapter instance.');
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

            await this.setConnected(true);
        } catch (error) {
            this.log.error(`Polling WeatherLink Live failed: ${(error as Error).message}`);
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
     * `sensors.cloudCover` / `sensors.cloudCoverModel`, using whichever model the currently
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
            const percent = computeCloudCoverSolar(iss.solar_rad, elevationDeg);
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

        if (!this.knownChannels.has('sensors.cloudCover')) {
            await this.setObjectNotExistsAsync('sensors.cloudCover', {
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
            await this.setObjectNotExistsAsync('sensors.cloudCoverModel', {
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
            this.knownChannels.add('sensors.cloudCover');
        }

        await this.setStateAsync('sensors.cloudCover', { val: result.percent, ack: true });
        await this.setStateAsync('sensors.cloudCoverModel', { val: result.model, ack: true });
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

        const cloudCoverState = await this.getStateAsync('sensors.cloudCover');
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
            isDay,
        });

        if (!result) {
            return;
        }

        if (!this.knownChannels.has('sensors.weatherCode')) {
            await this.setObjectNotExistsAsync('sensors.weatherCode', {
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
            await this.setObjectNotExistsAsync('sensors.weatherState', {
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
            await this.setObjectNotExistsAsync('sensors.weatherIcon', {
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
            this.knownChannels.add('sensors.weatherCode');
        }

        await this.setStateAsync('sensors.weatherCode', { val: result.code, ack: true });
        await this.setStateAsync('sensors.weatherState', { val: result.state, ack: true });
        await this.setStateAsync('sensors.weatherIcon', {
            val: `/adapter/${this.name}/${result.iconPath}`,
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

            if (value === null || value === undefined) {
                // Sensor exists but currently has no valid reading; keep last known value
                continue;
            }

            const val =
                field.type === 'boolean'
                    ? Boolean(value)
                    : field.isRain
                      ? convertRainCount(
                            Number(value),
                            (record as unknown as { rain_size?: number | null }).rain_size,
                            this.units,
                        )
                      : field.unitKind
                        ? convertValue(Number(value), field.unitKind, this.units)
                        : Number(value);
            await this.setStateAsync(stateId, { val, ack: true });
        }
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

            const renewInMs = Math.max(5, grantedDuration - REALTIME_RENEW_MARGIN_S) * 1000;
            this.realtimeRenewTimer = this.setTimeout(() => {
                void this.activateRealtime();
            }, renewInMs);
        } catch (error) {
            this.log.warn(`Could not activate real-time broadcast, retrying in 30s: ${(error as Error).message}`);
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
                this.log.info(`Discovered WeatherLink Live at ${device.address}:${device.port} (${device.name})`);
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
                this.log.error(`WeatherLink Live discovery failed: ${(error as Error).message}`);
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
