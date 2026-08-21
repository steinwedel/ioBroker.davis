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
- Optional HTML widget (`html.current`) with current conditions and a wind rose, for VIS/Jarvis

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
6. The **HTML widget** is enabled by default (`html.current`). Disable it in the instance settings if unused.

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
| Enable HTML widget | Writes ready-to-use HTML into `html.current` (enabled by default) |
| Web instance base URL | Optional; only if VIS/Jarvis cannot resolve relative `/adapter/davis/...` image paths |

## Object structure

```
davis.0
├── info
│   └── connection                 Connection status to the WeatherLink Live 6100
├── sensors
│   ├── tx<N>                      One channel per ISS transmitter (outdoor sensor)
│   │   ├── temperature, temperatureFrostWarning
│   │   ├── humidity
│   │   ├── dewPoint, dewPointText, wetBulb, windChill
│   │   ├── heatIndex, heatIndexText, thwIndex, thswIndex
│   │   ├── windSpeedLast
│   │   ├── windDirLast, windDirLastText
│   │   ├── windSpeedAvg10Min, windDirAvg10Min, windDirAvg10MinText
│   │   ├── windSpeedHi2Min, windDirHi2Min, windDirHi2MinText
│   │   ├── windSpeedHi10Min, windDirHi10Min, windDirHi10MinText
│   │   ├── rainRateLast, rainRateLastText, rainRateHi
│   │   ├── rainfall15Min, rainRateHi15Min, rainfall60Min, rainfall24Hr
│   │   ├── rainfallDaily, rainfallMonthly, rainfallYear
│   │   ├── rainStorm, rainStormStartAt, rainStormLast, rainStormLastStartAt, rainStormLastEndAt
│   │   ├── solarRad                                           (only if a solar sensor is present)
│   │   ├── uvIndex, uvIndexText                               (only if a solar sensor is present)
│   │   └── lowBattery, receptionState
│   ├── soilLeaf<N>                One channel per soil/leaf moisture transmitter (if present)
│   │   └── soilTemp1-4, soilMoisture1-4, leafWetness1-2, lowBattery
│   ├── barometer                  Only if a barometer sensor is present
│   │   └── seaLevel, absolute, trend
│   └── inside                     Only if an indoor sensor is present
│       └── temperature, humidity, dewPoint, heatIndex
├── minMax                         Day/month/year/absolute (and 5-min wind-direction) extremes
│   ├── day|month|year|absolute
│   │   ├── tx<N>
│   │   │   └── <field>Min, <field>MinTime, <field>Max, <field>MaxTime
│   │   ├── barometer
│   │   │   └── seaLevelMin, seaLevelMinTime, seaLevelMax, seaLevelMaxTime
│   │   └── inside
│   │       └── temperature*/humidity* Min/Max[+Time]
│   └── last5Min
│       └── tx<N>
│           └── windDirLastMin, windDirLastMax
├── calculated
│   ├── cloudCover                 Estimated cloud cover in % (0-100)
│   ├── cloudCoverModel            Which model was used (see below)
│   ├── weatherCode                Numeric weather code (see table below)
│   ├── weatherState               Human-readable weather state identifier
│   ├── weatherIcon                Path to the matching weather icon (SVG)
│   ├── evapotranspiration         Estimated reference evapotranspiration (ETo) for the current day, in mm/day
│   ├── clearSkyReference          Learned clear-sky solar reference (internal JSON)
│   └── lastTrustedCloudCover      Last trustworthy solar cloud-cover value (internal)
└── html                           Only if the HTML widget is enabled
    └── current                    Ready-to-use HTML for a VIS/Jarvis widget
```

**Important:** A live sensor channel/state is only created if the station actually reports the corresponding sensor. A station without a solar radiation sensor, for example, gets no `solarRad`/`uvIndex` states, and without a barometer no `sensors.barometer` channel is created. `calculated.cloudCover` / `weather*` / `evapotranspiration` are only created if enough data is available. `calculated.clearSkyReference` and `calculated.lastTrustedCloudCover` are always created (internal persistence for the solar model).

`receptionState` is the ISS radio link status: `0` = Synched & Tracking, `1` = Synched, `2` = Scanning.

`sensors.barometer.trend` is the 3-hour sea-level pressure change (same unit as the barometer).

Soil moisture is stored in centibar (`cb`) as reported by Davis (higher = drier). Leaf wetness is a raw station count, not a percentage.

`windDirLastText`, `windDirAvg10MinText`, `windDirHi2MinText` and `windDirHi10MinText` contain the respective wind direction as a 16-point compass abbreviation (e.g. `N`, `NNE`, `E`, `SSW`, …), derived from `windDirLast`/`windDirAvg10Min`/`windDirHi2Min`/`windDirHi10Min` in degrees.

`minMax.last5Min.tx<N>.windDirLastMin` and `minMax.last5Min.tx<N>.windDirLastMax` contain the two boundary angles of the smallest arc (in degrees) that encloses all wind direction readings from the last 5 minutes — i.e. the "spread" of the wind direction during that period. Going clockwise from `windDirLastMin` to `windDirLastMax` (wrapping across 360°/0° if `windDirLastMax` is a smaller value than `windDirLastMin`) covers all observed directions. The values are recalculated on every poll from a continuously maintained sliding 5-minute window of the most recent wind direction readings (not only after 5 minutes have elapsed — the very first reading already yields `windDirLastMin = windDirLastMax` = the current value, and the arc then grows continuously with each new reading until the 5-minute window is fully populated). For example: readings of 350°, 0° and 10° within the last 5 minutes yield `windDirLastMin = 350` and `windDirLastMax = 10` (a 20° arc across the 0°/360° boundary, not the much larger 340° span a naive min/max calculation would produce). This window is kept purely in memory and starts over after an adapter restart — unlike the day/month/year/absolute min/max values (see below), this is not a problem for a pure 5-minute indicator.

`uvIndexText` contains the UV risk category according to the WHO/WMO scale (`Low`, `Moderate`, `High`, `Very high`, `Extreme`), derived from `uvIndex`.

`rainRateLastText` contains the precipitation intensity according to the WMO/NWS scale (`No precipitation`, `Light`, `Moderate`, `Heavy`, `Very heavy`), derived from `rainRateLast`.

`heatIndexText` contains the heat warning category according to the NWS heat index scale (`None`, `Caution`, `Extreme caution`, `Danger`, `Extreme danger`), derived from `heatIndex`.

`dewPointText` contains the humidity/comfort category according to the NOAA dew point scale (`Dry`, `Comfortable`, `Humid`, `Very humid`), derived from `dewPoint`.

`temperatureFrostWarning` is `true` as soon as the current temperature is at or below 0 °C (frost/icing risk).

`rainStormStartAt`, `rainStormLastStartAt` and `rainStormLastEndAt` contain the respective timestamp as an ISO 8601 timestamp (e.g. `2026-08-02T00:15:00.000Z`), converted from the UNIX timestamp reported by the station.

## Minimum/maximum values (`minMax.<period>.<sensor>.<field>{Min,Max}` / `...Time`)

Extremes are **not** stored next to the live sensor readings. They live under a dedicated `minMax` tree, grouped first by period, then by the originating sensor channel:

```
minMax.day.tx1.temperatureMax
minMax.month.tx1.temperatureMax
minMax.year.tx1.temperatureMax
minMax.absolute.tx1.temperatureMax
minMax.last5Min.tx1.windDirLastMin   (wind-direction arc only; no ...Time states)
```

Tracked live fields: outdoor temperature, humidity, dew point, heat index, last wind speed, solar radiation, UV index; barometer sea-level pressure; indoor temperature and humidity.

For each of the four calendar periods (day / month / year / absolute) there are two states per extreme:

- `<field>Min` / `<field>Max` — the extreme value, in the currently configured display unit.
- `<field>MinTime` / `<field>MaxTime` — when that extreme was measured, as an ISO 8601 timestamp.

Example: `minMax.day.tx1.temperatureMax` = `28.4` and `minMax.day.tx1.temperatureMaxTime` = `2026-08-02T15:42:00.000Z` means: the highest temperature measured today was 28.4 °C, measured at 15:42 UTC.

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

## Real-time UDP updates

When real-time mode is enabled, the station broadcasts a subset of ISS fields about every 2.5 seconds: `windSpeedLast`, `windDirLast`, `rainRateLast`, `rainfallDaily`, `rainfallMonthly`, `rainfallYear`, `windSpeedHi10Min`. All other states update only on the HTTP poll interval. Companion text states (`windDirLastText`, `rainRateLastText`) and the 5-minute wind-direction arc are updated together with those broadcasts.

## HTML widget (`html.current`)

If enabled (default), the adapter writes a self-contained HTML snippet (current conditions, weather icon, wind rose with the 5-minute direction arc) to `html.current`. Bind that state in a VIS or Jarvis HTML widget.

Image paths are `/adapter/davis/img/weathericons/...`. That works when the page is served by the ioBroker `web` instance. If icons stay broken (typical for some Jarvis setups), set **Web instance base URL** to that instance, e.g. `http://192.168.1.10:8082`. Rebuilds are throttled so the ~2.5 s real-time stream does not rewrite the HTML on every packet.

## Known limitations

- The cloud cover and weather icon estimates are **approximations**, not measurements. The solar-radiation-based model typically achieves ±10-15% accuracy during daylight; the dew-point heuristic is considerably rougher and should be understood as a trend indicator rather than a precise value.
- Without a configured location (latitude/longitude) in the ioBroker system settings, only the dew-point heuristic works, not the more accurate solar-radiation-based model.
- Automatic device discovery only works if UDP multicast is not blocked on the local network.
- Real-time mode also needs UDP (broadcast port 22222) from the WeatherLink Live 6100 to the ioBroker host.
- Relative widget icon paths fail if the VIS/Jarvis host is not the ioBroker web instance — set the optional base URL then.

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**

### 0.0.20 (2026-08-21)
* (steinwedel) **FIXED**: README object tree now matches the `minMax.*` layout and documents `html.current`, real-time fields, reception/barometer/soil notes, and widget usage
* (steinwedel) **FIXED**: Pin ioBroker testing-action-adapter and testing-action-deploy to major `@v1` (adapter checker S3043/S3044)

### 0.0.19 (2026-08-19)
* (steinwedel) **FIXED**: Updated ioBroker GitHub Actions to versions that use Node.js 24 instead of deprecated Node.js 20

### 0.0.18 (2026-08-19)
* (steinwedel) **FIXED**: Removed redundant `@types/mocha` from devDependencies (already provided by `@iobroker/testing`)

### 0.0.17 (2026-08-19)
* (steinwedel) **FIXED**: Adapter checker: `common.nogit` spelling, `@tsconfig/node22`, release-script `manual-review` plugin, and Dependabot auto-merge workflow

### 0.0.16 (2026-08-19)
* (steinwedel) **FIXED**: Adapter checker findings: Node.js >=22, ioBroker keyword, admin >=7.6.20, news for unpublished versions removed, adapter timers instead of Node setTimeout, missing admin i18n files, jsonConfig sizes/translation keys, README changelog format, and common.noGit

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
