![Logo](admin/davis.png)
# ioBroker.davis

[![NPM version](https://img.shields.io/npm/v/iobroker.davis.svg)](https://www.npmjs.com/package/iobroker.davis)
[![Downloads](https://img.shields.io/npm/dm/iobroker.davis.svg)](https://www.npmjs.com/package/iobroker.davis)
![Number of Installations](https://iobroker.live/badges/davis-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/davis-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.davis.png?downloads=true)](https://nodei.co/npm/iobroker.davis/)

**Tests:** ![Test and Release](https://github.com/steinwedel/ioBroker.davis/actions/workflows/test-and-release.yml/badge.svg?branch=main)

## Overview

This adapter reads weather data from a [Davis WeatherLink Live 6100 (WLL)](https://www.davisinstruments.com/products/weatherlink-live) via its local HTTP API on the home network and exposes it as ioBroker states. No cloud connection or Davis account is required — the adapter communicates exclusively directly with the device on the local network.

Since different WeatherLink Live stations can be equipped with different sensors/transmitters (e.g. with or without a solar radiation sensor, with or without a soil/leaf moisture sensor, with or without a barometer), the adapter **dynamically** creates objects only for the sensors that the respective station actually reports.

### Features

- Reads all sensor data via the local API (polling interval configurable)
- Real-time mode via UDP broadcast for wind and rain data (updated roughly every 2.5 seconds)
- Automatic device discovery on the local network via mDNS/Bonjour
- Metric (°C, km/h, hPa, mm) or imperial (°F, mph, inHg, in) units, selectable
- Estimated cloud cover and a simplified current weather icon, derived from the available sensor data

## Requirements

- A Davis WeatherLink Live 6100 (WLL) on the same local network as the ioBroker server
- Node.js ≥ 22 (provided by ioBroker itself)
- For automatic device discovery: UDP multicast must be allowed on the network (this is often not the case in corporate networks/VLANs — in that case enter the IP address manually)

## Installation & Setup

1. Create the adapter instance `davis.0` via the ioBroker admin UI.
2. In the instance configuration, either:
   - click **"Find WeatherLink Live 6100"** to automatically discover the device on the network (IP address and port are filled in automatically), or
   - manually enter the **IP address** of the WeatherLink Live 6100.
3. Optionally adjust the **polling interval** (default: 20 seconds, minimum 10 seconds per the Davis API) and the desired **units** (metric/imperial).
4. Optionally enable **real-time mode** to receive wind and rain data much more frequently.
5. For cloud cover and weather icon estimation: latitude and longitude must be configured under **Main page → System settings** in ioBroker (not in the adapter configuration itself).

## Configuration

| Setting | Description |
|---|---|
| WeatherLink Live 6100 IP address | Local IP address of the device, e.g. `192.168.1.50` |
| Port | TCP port of the local API (default: 80) |
| "Find WeatherLink Live 6100" | Automatically discovers the device via mDNS/Bonjour on the local network |
| Polling interval (seconds) | How often current values are queried via HTTP (minimum 10s) |
| Units | Metric (°C, km/h, hPa, mm) or imperial (°F, mph, inHg, in) |
| Real-time mode | Enables the UDP broadcast for high-frequency wind/rain data |
| Real-time broadcast duration | How long an activation is requested; renewed automatically |

## Object structure

```
davis.0
├── info
│   └── connection              Connection status to the WeatherLink Live 6100
├── sensors
│   ├── tx<N>                   One channel per ISS transmitter (outdoor sensor)
│   │   ├── temperature, temperatureFrostWarning, temperature{Day,Month,Year,Absolute}{Min,Max}[Time]
│   │   ├── humidity, humidity{Day,Month,Year,Absolute}{Min,Max}[Time]
│   │   ├── dewPoint, dewPointText, dewPoint{Day,Month,Year,Absolute}{Min,Max}[Time], wetBulb, windChill
│   │   ├── heatIndex, heatIndexText, heatIndex{Day,Month,Year,Absolute}{Min,Max}[Time], thwIndex, thswIndex, ...
│   │   ├── windSpeedLast, windSpeedLast{Day,Month,Year,Absolute}{Min,Max}[Time]
│   │   ├── windDirLast, windDirLastText, windDirLastMin5Min, windDirLastMax5Min, windSpeedAvg10Min, windDirAvg10Min, windDirAvg10MinText
│   │   ├── windSpeedHi2Min, windDirHi2Min, windDirHi2MinText, windSpeedHi10Min, windDirHi10Min, windDirHi10MinText
│   │   ├── rainRateLast, rainRateLastText, rainRateHi, rainfall15Min, rainRateHi15Min, rainfall60Min, rainfall24Hr
│   │   ├── rainfallDaily, rainfallMonthly, rainfallYear
│   │   ├── rainStorm, rainStormStartAt, rainStormLast, rainStormLastStartAt, rainStormLastEndAt
│   │   ├── solarRad, solarRad{Day,Month,Year,Absolute}{Min,Max}[Time]                    (only if a solar sensor is present)
│   │   ├── uvIndex, uvIndexText, uvIndex{Day,Month,Year,Absolute}{Min,Max}[Time]         (only if a solar sensor is present)
│   │   └── lowBattery, receptionState
│   ├── soilLeaf<N>              One channel per soil/leaf moisture transmitter (if present)
│   │   └── soilTemp1-4, soilMoisture1-4, leafWetness1-2, lowBattery
│   ├── barometer                Only if a barometer sensor is present
│   │   └── seaLevel, seaLevel{Day,Month,Year,Absolute}{Min,Max}[Time], absolute, trend
│   └── inside                   Only if an indoor sensor is present
│       └── temperature, temperature{Day,Month,Year,Absolute}{Min,Max}[Time], humidity, humidity{Day,Month,Year,Absolute}{Min,Max}[Time], dewPoint, heatIndex
└── calculated
    ├── cloudCover                Estimated cloud cover in % (0-100)
    ├── cloudCoverModel           Which model was used (see below)
    ├── weatherCode               Numeric weather code (see table below)
    ├── weatherState              Human-readable weather state identifier
    ├── weatherIcon               Path to the matching weather icon (SVG)
    └── evapotranspiration        Estimated reference evapotranspiration (ETo) for the current day, in mm/day
```

**Important:** A channel/state is only created if the station actually reports the corresponding sensor. A station without a solar radiation sensor, for example, gets no `solarRad`/`uvIndex` states, and without a barometer no `sensors.barometer` channel is created. Likewise, the `calculated.*` states are only created if enough sensor data is available for at least one of the calculation methods described below.

`windDirLastText`, `windDirAvg10MinText`, `windDirHi2MinText` and `windDirHi10MinText` contain the respective wind direction as a 16-point compass abbreviation (e.g. `N`, `NNE`, `E`, `SSW`, …), derived from `windDirLast`/`windDirAvg10Min`/`windDirHi2Min`/`windDirHi10Min` in degrees.

`windDirLastMin5Min` and `windDirLastMax5Min` contain the two boundary angles of the smallest arc (in degrees) that encloses all wind direction readings from the last 5 minutes — i.e. the "spread" of the wind direction during that period. Going clockwise from `windDirLastMin5Min` to `windDirLastMax5Min` (wrapping across 360°/0° if `windDirLastMax5Min` is a smaller value than `windDirLastMin5Min`) covers all observed directions. The values are recalculated on every poll from a continuously maintained sliding 5-minute window of the most recent wind direction readings (not only after 5 minutes have elapsed — the very first reading already yields `windDirLastMin5Min = windDirLastMax5Min` = the current value, and the arc then grows continuously with each new reading until the 5-minute window is fully populated). For example: readings of 350°, 0° and 10° within the last 5 minutes yield `windDirLastMin5Min = 350` and `windDirLastMax5Min = 10` (a 20° arc across the 0°/360° boundary, not the much larger 340° span a naive min/max calculation would produce). This window is kept purely in memory and starts over after an adapter restart — unlike the day/month/year/absolute min/max values (see below), this is not a problem for a pure 5-minute indicator.

`uvIndexText` contains the UV risk category according to the WHO/WMO scale (`Low`, `Moderate`, `High`, `Very high`, `Extreme`), derived from `uvIndex`.

`rainRateLastText` contains the precipitation intensity according to the WMO/NWS scale (`No precipitation`, `Light`, `Moderate`, `Heavy`, `Very heavy`), derived from `rainRateLast`.

`heatIndexText` contains the heat warning category according to the NWS heat index scale (`None`, `Caution`, `Extreme caution`, `Danger`, `Extreme danger`), derived from `heatIndex`.

`dewPointText` contains the humidity/comfort category according to the NOAA dew point scale (`Dry`, `Comfortable`, `Humid`, `Very humid`), derived from `dewPoint`.

`temperatureFrostWarning` is `true` as soon as the current temperature is at or below 0 °C (frost/icing risk).

`rainStormStartAt`, `rainStormLastStartAt` and `rainStormLastEndAt` contain the respective timestamp as an ISO 8601 timestamp (e.g. `2026-08-02T00:15:00.000Z`), converted from the UNIX timestamp reported by the station.

## Minimum/maximum values (`<field>{Day,Month,Year,Absolute}{Min,Max}` / `...Time`)

For the actually measured sensor values (temperature, humidity, dew point, heat index, wind speed, solar radiation, UV index, air pressure — both outdoor and indoor), the minimum and maximum values for the current day, the current month, the current year and since the adapter was installed ("Absolute") are automatically tracked in addition to the current value. For each of these eight combinations (4 periods × min/max) there are two states:

- `<field>DayMin`, `<field>MonthMin`, `<field>YearMin`, `<field>AbsoluteMin` (and analogously `...Max`) — the respective extreme value, in the currently configured display unit.
- `<field>DayMinTime`, `<field>MonthMinTime`, `<field>YearMinTime`, `<field>AbsoluteMinTime` (and analogously `...MaxTime`) — the time at which this extreme value was measured, as an ISO 8601 timestamp.

Example: `sensors.tx1.temperatureDayMax` = `28.4` and `sensors.tx1.temperatureDayMaxTime` = `2026-08-02T15:42:00.000Z` means: the highest temperature measured today was 28.4 °C, measured at 15:42 UTC.

The day/month/year buckets reset automatically at the respective calendar change (local time of the system running ioBroker); the "Absolute" value is never reset and is preserved across adapter restarts (the values are reconstructed from the existing states). **Note:** Since the values are stored in the currently configured display unit, later changing the unit (metric/imperial) in the adapter settings means already-recorded extreme values continue to be shown in the unit that was valid at the time they were measured.

## Evapotranspiration estimate (`calculated.evapotranspiration`)

From today's minimum and maximum outdoor temperature (see above) and the latitude configured in the ioBroker system settings, a reference evapotranspiration (ETo, mm/day) is estimated using the simplified Hargreaves-Samani equation — the metric commonly used in irrigation systems for plant water demand. This method does not require humidity, wind or direct radiation measurements and is therefore considerably simpler than the full FAO-56 Penman-Monteith method, but also correspondingly less accurate (typically ±15-20% deviation for daily totals). Requirement: location (latitude/longitude) configured in the ioBroker system settings **and** at least one temperature reading for the current day — the estimate becomes more accurate over the course of the day as the actually recorded temperature range (daily minimum/maximum) grows.

## Cloud cover estimate (`calculated.cloudCover`)

Since the WeatherLink Live 6100 does not report cloud cover itself, it is estimated from the available sensor data. Depending on the station's equipment, one of two models is used:

1. **Solar-radiation-based** (`cloudCoverModel = "solar"`): compares the measured solar radiation against a clear-sky reference for the current sun elevation. Requirement: a solar radiation sensor is present **and** latitude/longitude is configured in the ioBroker system settings **and** the sun is sufficiently high (not during twilight/night).

   The clear-sky reference is **learned adaptively per sun elevation** (`calculated.clearSkyReference`, internal, 15-day rolling window): the adapter remembers, per 5° sun elevation step, the highest solar radiation value actually measured. This best value is scaled down to the current sun elevation and treated as an outlier (not as a typical clear-sky day), so that a visually clear but slightly hazy morning does not appear as cloudy. Until actual readings are available for a given sun elevation, the adapter temporarily uses a conservatively reduced Haurwitz formula. Below 15° sun elevation (twilight/early morning) the solar model is unreliable — the last trustworthy daytime value is held instead of falling back to the dew-point heuristic or a twilight estimate.
2. **Dew-point heuristic** (`cloudCoverModel = "heuristic"` or `"heuristic+pressure"`): used only when **no** solar sensor is present. Humidity after a clear night is not cloud cover.

If neither model can be computed with the available sensors, `calculated.cloudCover` is not created at all.

## Weather icon (`calculated.weatherIcon`)

A simplified current weather symbol is derived from the estimated cloud cover, the current rain rate, the temperature and the dew point — similar to the weather symbols used e.g. by the German Weather Service (DWD) in its MOSMIX forecasts with the WMO "significant weather" code (`ww`). Since a weather station only measures the current moment (no forecast), a simplified selection of these international code categories is used.

The icon graphics are a subset of [Meteocons](https://github.com/basmilius/meteocons) by Bas Milius (MIT license, see `admin/img/weathericons/LICENSE`) and are bundled locally with the adapter — no external image source is needed at runtime. `calculated.weatherIcon` contains the path to the respective SVG file (e.g. `/adapter/davis/img/weathericons/clear-day.svg`), which can be used directly in VIS widgets.

### Meaning of the numeric weather code (`calculated.weatherCode`)

| Code | `weatherState` | Meaning |
|---|---|---|
| 0 | `clear` | Clear (cloud cover ≤ 10%) |
| 1 | `mostlyClear` | Mostly clear (cloud cover ≤ 40%) |
| 2 | `partlyCloudy` | Partly cloudy (cloud cover ≤ 70%) |
| 3 | `cloudy` | Cloudy (cloud cover ≤ 90%) |
| 3 | `overcast` | Overcast (cloud cover > 90%) |
| 45 | `fog` | Fog (dew point depression ≤ 0.5 °C with little wind) |
| 51 | `drizzle` | Light precipitation (rain rate ≤ 0.5 mm/h) |
| 61 | `rain` | Rain |
| 65 | `heavyRain` | Heavy rain (rain rate ≥ 4 mm/h) without an overcast sky as thunderstorm confirmation |
| 68 | `sleet` | Sleet/freezing rain (rain at temperature between 0 °C and 2 °C) |
| 71 | `snow` | Snow (rain at temperature ≤ 0 °C) |
| 75 | `heavySnow` | Heavy snowfall (rain rate ≥ 2 mm/h at temperature ≤ 0 °C) |
| 95 | `thunderstorm` | Suspected thunderstorm (heavy rain plus at least one, or when several signals are available at least two matching indicators: near-overcast sky, gust-front wind spike, or a sharp pressure drop) |

The codes follow the WMO table 4677/4680 (the same classification underlying DWD MOSMIX data), but are reduced to the categories that can reliably be derived from a single snapshot. Finer distinctions of the international table (e.g. "thunderstorm in the last hour, currently over" or a reliable distinction between sleet and freezing rain) cannot be determined from station measurements alone. The `cloudy` and `overcast` categories share WMO code 3, since the classic table does not provide separate codes for them — the `weatherState` text and the respective icon are used to distinguish them. When precipitation occurs without a (near-)overcast sky, a "partly cloudy + precipitation" icon variant is used instead, if available.

The WeatherLink Live 6100 does not support a lightning sensor (unlike the older Vantage Pro2/Vue series or the WeatherLink Cloud/AirLink), so thunderstorms can never be detected directly, only suspected from accompanying indicators: heavy rain plus at least one confirming signal (a near-overcast sky, a gust-front wind jump between the 2-minute peak and the 10-minute average wind, or a sharp 3-hour pressure drop on the barometer). If several of these signals are available, at least two must agree, so that a single ambiguous signal (e.g. only an overcast sky, which also occurs during ordinary steady rain) is not sufficient on its own.

`calculated.weatherCode`/`weatherIcon`/`weatherState` are only created if at least the cloud cover **or** an active rain measurement is available.

## Units and rainfall amounts

The WeatherLink Live 6100 always reports all values in imperial units (°F, mph, inHg). When "Metric" is enabled, the adapter converts temperature, wind speed and air pressure before storing them. Rain values are converted from raw tip counts into a physical rainfall amount (mm or inches) based on the tip size (`rain_size`) reported by the device.

## Known limitations

- The cloud cover and weather icon estimates are **approximations**, not measurements. The solar-radiation-based model typically achieves ±10-15% accuracy during daylight; the dew-point heuristic is considerably rougher and should be understood as a trend indicator rather than a precise value.
- Without a configured location (latitude/longitude) in the ioBroker system settings, only the dew-point heuristic works, not the more accurate solar-radiation-based model.
- Automatic device discovery only works if UDP multicast is not blocked on the local network.

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**

### 0.0.18 (2026-08-19)
* (steinwedel) **FIXED**: Removed redundant `@types/mocha` from devDependencies (already provided by `@iobroker/testing`)

### 0.0.17 (2026-08-19)
* (steinwedel) **FIXED**: Adapter checker: `common.nogit` spelling, `@tsconfig/node22`, release-script `manual-review` plugin, and Dependabot auto-merge workflow

### 0.0.16 (2026-08-19)
* (steinwedel) **FIXED**: Adapter checker findings: Node.js >=22, ioBroker keyword, admin >=7.6.20, news for unpublished versions removed, adapter timers instead of Node setTimeout, missing admin i18n files, jsonConfig sizes/translation keys, README changelog format, and common.noGit

### 0.0.15 (2026-08-17)
* (steinwedel) **ENHANCED**: README.md is now in English (was German-only), adds a link to the Davis WeatherLink Live product page, and the changelog was moved out of README.md into a dedicated CHANGELOG.md
* (steinwedel) **ENHANCED**: Repository metadata cleanup for the ioBroker latest-repository submission: replaced the placeholder contact address, added GitHub repository topics, added the `iobroker` npm package owner, and fixed an invalid GitHub Actions input on the integration-tests job

### 0.0.14 (2026-08-16)
* (steinwedel) **NEW**: Added an optional `html.current` dashboard widget with current conditions, a wind rose, and a weather forecast.
* (steinwedel) **FIXED**: Clear skies were reported as cloudy again in the early morning: the solar model is not trustworthy below ~15° sun elevation (cosine error, horizon, GHI ramp), and holding the last dusk reading or falling back to dew-point humidity both freeze "bewölkt" overnight. Trusted solar estimates are now only taken at ≥ 15°, persisted separately, and used until then; a solar station never uses the humidity heuristic.
* (steinwedel) **CHANGED**: The wind direction spread indicator now exposes the arc's two boundary angles (windDirLastMin5Min/windDirLastMax5Min) instead of a single opening-angle number, so the actual observed direction range can be shown, not just its size
* (steinwedel) **FIXED**: Wind direction range tracking no longer includes readings taken during calm wind, since a vane's direction becomes unreliable noise at near-zero speed and could otherwise make the tracked 5-minute range balloon out to a spurious value (e.g. 0°) the wind never actually blew from

Older changes are in [CHANGELOG_OLD.md](CHANGELOG_OLD.md).

## License
MIT License

Copyright (c) 2026 steinwedel <github.com@steinwedel.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
