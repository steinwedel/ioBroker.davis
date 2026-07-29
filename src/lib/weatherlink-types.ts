/* eslint-disable jsdoc/require-jsdoc -- this file only contains plain data type definitions */
/**
 * Type definitions for the WeatherLink Live (WLL) Local API.
 *
 * See https://weatherlink.github.io/weatherlink-live-local-api/ for details.
 * All fields are optional/nullable because different station configurations
 * (transmitter count, sensor types) will produce different payloads.
 */

/** data_structure_type values used by the WLL Local API */
export const enum DataStructureType {
    ISS = 1,
    LeafSoil = 2,
    LssBar = 3,
    LssTempHum = 4,
}

export interface IssCondition {
    lsid?: number;
    data_structure_type: DataStructureType.ISS;
    txid?: number;
    temp?: number | null;
    hum?: number | null;
    dew_point?: number | null;
    wet_bulb?: number | null;
    heat_index?: number | null;
    wind_chill?: number | null;
    thw_index?: number | null;
    thsw_index?: number | null;
    wind_speed_last?: number | null;
    wind_dir_last?: number | null;
    wind_speed_avg_last_1_min?: number | null;
    wind_dir_scalar_avg_last_1_min?: number | null;
    wind_speed_avg_last_2_min?: number | null;
    wind_dir_scalar_avg_last_2_min?: number | null;
    wind_speed_hi_last_2_min?: number | null;
    wind_dir_at_hi_speed_last_2_min?: number | null;
    wind_speed_avg_last_10_min?: number | null;
    wind_dir_scalar_avg_last_10_min?: number | null;
    wind_speed_hi_last_10_min?: number | null;
    wind_dir_at_hi_speed_last_10_min?: number | null;
    rain_size?: number | null;
    rain_rate_last?: number | null;
    rain_rate_hi?: number | null;
    rainfall_last_15_min?: number | null;
    rain_rate_hi_last_15_min?: number | null;
    rainfall_last_60_min?: number | null;
    rainfall_last_24_hr?: number | null;
    rain_storm?: number | null;
    rain_storm_start_at?: number | null;
    solar_rad?: number | null;
    uv_index?: number | null;
    rx_state?: number | null;
    trans_battery_flag?: number | null;
    rainfall_daily?: number | null;
    rainfall_monthly?: number | null;
    rainfall_year?: number | null;
    rain_storm_last?: number | null;
    rain_storm_last_start_at?: number | null;
    rain_storm_last_end_at?: number | null;
}

export interface LeafSoilCondition {
    lsid?: number;
    data_structure_type: DataStructureType.LeafSoil;
    txid?: number;
    temp_1?: number | null;
    temp_2?: number | null;
    temp_3?: number | null;
    temp_4?: number | null;
    moist_soil_1?: number | null;
    moist_soil_2?: number | null;
    moist_soil_3?: number | null;
    moist_soil_4?: number | null;
    wet_leaf_1?: number | null;
    wet_leaf_2?: number | null;
    rx_state?: number | null;
    trans_battery_flag?: number | null;
}

export interface LssBarCondition {
    lsid?: number;
    data_structure_type: DataStructureType.LssBar;
    bar_sea_level?: number | null;
    bar_trend?: number | null;
    bar_absolute?: number | null;
}

export interface LssTempHumCondition {
    lsid?: number;
    data_structure_type: DataStructureType.LssTempHum;
    temp_in?: number | null;
    hum_in?: number | null;
    dew_point_in?: number | null;
    heat_index_in?: number | null;
}

export type Condition = IssCondition | LeafSoilCondition | LssBarCondition | LssTempHumCondition;

export interface CurrentConditionsResponse {
    data: {
        did: string;
        ts: number;
        conditions: Condition[];
    } | null;
    error: {
        code: number;
        message: string;
    } | null;
}

export interface RealTimeActivationResponse {
    data: {
        broadcast_port: number;
        duration: number;
    } | null;
    error: {
        code: number;
        message: string;
    } | null;
}

/** ISS Rapid Update record broadcast over UDP (data_structure_type 1) */
export interface RealtimeIssRecord {
    lsid?: number;
    data_structure_type: 1;
    txid?: number;
    wind_speed_last?: number | null;
    wind_dir_last?: number | null;
    rain_size?: number | null;
    rain_rate_last?: number | null;
    rainfall_daily?: number | null;
    rainfall_monthly?: number | null;
    rainfall_year?: number | null;
    wind_speed_hi_last_10_min?: number | null;
}

export interface RealtimeBroadcastPacket {
    did: string;
    ts: number;
    conditions: RealtimeIssRecord[];
}
