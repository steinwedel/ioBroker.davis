# Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
## 0.0.15 (2026-08-17)
* (steinwedel) **ENHANCED**: README.md is now in English (was German-only), adds a link to the Davis WeatherLink Live product page, and the changelog was moved out of README.md into a dedicated CHANGELOG.md
* (steinwedel) **ENHANCED**: Repository metadata cleanup for the ioBroker latest-repository submission: replaced the placeholder contact address, added GitHub repository topics, added the `iobroker` npm package owner, and fixed an invalid GitHub Actions input on the integration-tests job

### 0.0.14 (2026-08-16)
* (steinwedel) **NEW**: Added an optional `html.current` dashboard widget with current conditions, a wind rose, and a weather forecast.
* (steinwedel) **FIXED**: Clear skies were reported as cloudy again in the early morning: the solar model is not trustworthy below ~15° sun elevation (cosine error, horizon, GHI ramp), and holding the last dusk reading or falling back to dew-point humidity both freeze "bewölkt" overnight. Trusted solar estimates are now only taken at ≥ 15°, persisted separately, and used until then; a solar station never uses the humidity heuristic.
* (steinwedel) **CHANGED**: The wind direction spread indicator now exposes the arc's two boundary angles (windDirLastMin5Min/windDirLastMax5Min) instead of a single opening-angle number, so the actual observed direction range can be shown, not just its size
* (steinwedel) **FIXED**: Wind direction range tracking no longer includes readings taken during calm wind, since a vane's direction becomes unreliable noise at near-zero speed and could otherwise make the tracked 5-minute range balloon out to a spurious value (e.g. 0°) the wind never actually blew from

### 0.0.13 (2026-08-02)
* (steinwedel) **NEW**: Rain intensity, frost warning, heat risk and dew point comfort categories, day and month minimum and maximum tracking, an evapotranspiration estimate, and a wind direction spread indicator, derived from existing sensor data

### 0.0.12 (2026-08-01)
* (steinwedel) **CHANGED**: A failed real-time broadcast activation is now only logged as a warning after 3 consecutive failed attempts (transient failures before that are logged at debug level only), since occasional single activation failures against the WeatherLink Live are normal and self-recover on the next retry

### 0.0.11 (2026-07-30)
* (steinwedel) **FIXED**: The solar-based cloud cover model now averages solar radiation readings over a 5-minute window before computing the clear-sky index, instead of using only the single most recent reading. A single brief cloud shadow (well under a minute) could otherwise swing the reported cloud cover by tens of percentage points even though the overall sky condition had not changed (observed e.g. 39% instead of ~0% during a momentary dip). The site-learned clear-sky reference calibration itself is unaffected and still uses the raw (unsmoothed) peak reading.

### 0.0.10 (2026-07-30)
* (steinwedel) **NEW**: Added `wind.svg`, `sleet.svg` and `hail.svg` to the bundled weather icon set (`admin/img/weathericons/`), covering the full Bright Sky/DWD icon vocabulary for external scripts/widgets that reuse these icons

### 0.0.9 (2026-07-30)
* (steinwedel) **NEW**: `sensors.tx<N>.windDirLastText` - current wind direction as a 16-point compass abbreviation (e.g. "N", "NNO", "O", "SSW"), derived from `windDirLast`

### 0.0.8 (2026-07-30)
* (steinwedel) **FIXED**: The solar-based cloud cover model now learns a site-specific clear-sky reference per sun elevation angle (persisted in `calculated.clearSkyReference`) instead of relying solely on the generic Haurwitz formula, which could overestimate the theoretically achievable clear-sky irradiance and thus report cloud cover on genuinely clear days (observed e.g. 14% instead of 0% at 28° sun elevation)

### 0.0.7 (2026-07-30)
* (steinwedel) **CHANGED**: Vollständiger Gerätename "Davis WeatherLink Live 6100" statt nur "Davis WeatherLink Live" in Dokumentation, Admin-UI-Texten und Adapter-Beschreibung verwendet

### 0.0.6 (2026-07-30)
* (steinwedel) **CHANGED**: README komplett überarbeitet: Entwickler-Boilerplate entfernt, echte Nutzerdokumentation (Installation, Konfiguration, Objektstruktur, Bewölkungs-/Wetter-Icon-Modelle, Wettercode-Tabelle) ergänzt

### 0.0.5 (2026-07-30)
* (steinwedel) **CHANGED**: Calculated/derived values (`cloudCover`, `cloudCoverModel`, `weatherCode`, `weatherState`, `weatherIcon`) moved from `sensors.*` into a dedicated `calculated.*` folder, to keep them separate from the raw per-transmitter sensor channels. Existing installations should delete the old `sensors.cloudCover*`/`sensors.weather*` states, as they are no longer updated.

### 0.0.4 (2026-07-30)
* (steinwedel) **NEW**: Simplified current-weather icon (`sensors.weatherCode`, `sensors.weatherState`, `sensors.weatherIcon`) derived from cloud cover, rain rate, temperature and dew point, using a WMO-`ww`-code-inspired classification (in the spirit of DWD's MOSMIX significant weather codes). Icon graphics are a bundled MIT-licensed subset of [Meteocons](https://github.com/basmilius/meteocons) by Bas Milius (see `admin/img/weathericons/LICENSE`). No value is created unless the required sensors/estimates are available.
* (steinwedel) **FIXED**: The dew-point-based cloud cover heuristic now correctly converts temperature/dew point (°F->°C) and the barometric pressure trend (inHg->hPa) before applying its thresholds; previously the raw imperial values were used directly, which skewed the estimate
* (steinwedel) **CHANGED**: Latitude/longitude for the solar-based cloud cover model and day/night icon detection are now taken from ioBroker's system-wide location setting (Admin -> System settings) instead of a separate adapter configuration field

### 0.0.3 (2026-07-30)
* (steinwedel) **NEW**: Estimated cloud cover (`sensors.cloudCover`, `sensors.cloudCoverModel`), using a solar-radiation clear-sky index when a solar sensor and location (latitude/longitude) are configured, falling back to a rougher dew-point-based heuristic (optionally refined with the barometric pressure trend if a barometer is present) otherwise. No value is created if neither model's required sensors are present.

### 0.0.2 (2026-07-29)
* (steinwedel) **NEW**: Initial implementation using the WeatherLink Live Local API (`/v1/current_conditions` polling) with dynamic object creation adapting to the transmitters/sensors actually configured on the station
* (steinwedel) **NEW**: Real-time mode via `/v1/real_time` UDP broadcast (port 22222) for high-frequency wind/rain updates
* (steinwedel) **NEW**: "Find WeatherLink Live" button in the admin UI that discovers the device via mDNS/Bonjour (`_weatherlinklive._tcp.local`) and automatically fills in its IP address and port
* (steinwedel) **NEW**: Configurable unit system (metric °C/km/h/hPa or imperial °F/mph/inHg); the Local API always reports imperial values, which are converted before being stored when "Metric" is selected
* (steinwedel) **NEW**: Rain fields are converted from raw tip counts to a physical rainfall depth (mm/mm per hour when metric, inches/inches per hour when imperial), using the collector's tip size (`rain_size`) reported by the device

### 0.0.1
* (steinwedel) initial release
