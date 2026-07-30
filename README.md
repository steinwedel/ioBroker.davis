![Logo](admin/davis.png)
# ioBroker.davis

[![NPM version](https://img.shields.io/npm/v/iobroker.davis.svg)](https://www.npmjs.com/package/iobroker.davis)
[![Downloads](https://img.shields.io/npm/dm/iobroker.davis.svg)](https://www.npmjs.com/package/iobroker.davis)
![Number of Installations](https://iobroker.live/badges/davis-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/davis-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.davis.png?downloads=true)](https://nodei.co/npm/iobroker.davis/)

**Tests:** ![Test and Release](https://github.com/steinwedel/ioBroker.davis/workflows/Test%20and%20Release/badge.svg)

## davis adapter for ioBroker

Adapter for Davis WeatherLink Live weather stations (local API)

## Developer manual
This section is intended for the developer. It can be deleted later.

### DISCLAIMER

Please make sure that you consider copyrights and trademarks when you use names or logos of a company and add a disclaimer to your README.
You can check other adapters for examples or ask in the developer community. Using a name or logo of a company without permission may cause legal problems for you.

### Getting started

You are almost done, only a few steps left:
1. Create a new repository on GitHub with the name `ioBroker.davis`
1. Initialize the current folder as a new git repository:  
    ```bash
    git init -b main
    git add .
    git commit -m "Initial commit"
    ```
1. Link your local repository with the one on GitHub:  
    ```bash
    git remote add origin https://github.com/steinwedel/ioBroker.davis
    ```

1. Push all files to the GitHub repo:  
    ```bash
    git push origin main
    ```

1. Head over to [src/main.ts](src/main.ts) and start programming!

### Best Practices
We've collected some [best practices](https://github.com/ioBroker/ioBroker.repositories#development-and-coding-best-practices) regarding ioBroker development and coding in general. If you're new to ioBroker or Node.js, you should
check them out. If you're already experienced, you should also take a look at them - you might learn something new :)

### State Roles
When creating state objects, it is important to use the correct role for the state. The role defines how the state should be interpreted by visualizations and other adapters. For a list of available roles and their meanings, please refer to the [state roles documentation](https://www.iobroker.net/#en/documentation/dev/stateroles.md).

**Important:** Do not invent your own custom role names. If you need a role that is not part of the official list, please contact the ioBroker developer community for guidance and discussion about adding new roles.

### Scripts in `package.json`
Several npm scripts are predefined for your convenience. You can run them using `npm run <scriptname>`
| Script name | Description |
|-------------|-------------|
| `build` | Compile the TypeScript sources. |
| `watch` | Compile the TypeScript sources and watch for changes. |
| `test:ts` | Executes the tests you defined in `*.test.ts` files. |
| `test:package` | Ensures your `package.json` and `io-package.json` are valid. |
| `test:integration` | Tests the adapter startup with an actual instance of ioBroker. |
| `test` | Performs a minimal test run on package files and your tests. |
| `check` | Performs a type-check on your code (without compiling anything). |
| `lint` | Runs `ESLint` to check your code for formatting errors and potential bugs. |
| `translate` | Translates texts in your adapter to all required languages, see [`@iobroker/adapter-dev`](https://github.com/ioBroker/adapter-dev#manage-translations) for more details. |

### Configuring the compilation
The adapter template uses [esbuild](https://esbuild.github.io/) to compile TypeScript and/or React code. You can configure many compilation settings 
either in `tsconfig.json` or by changing options for the build tasks. These options are described in detail in the
[`@iobroker/adapter-dev` documentation](https://github.com/ioBroker/adapter-dev#compile-adapter-files).

### Writing tests
When done right, testing code is invaluable, because it gives you the 
confidence to change your code while knowing exactly if and when 
something breaks. A good read on the topic of test-driven development 
is https://hackernoon.com/introduction-to-test-driven-development-tdd-61a13bc92d92. 
Although writing tests before the code might seem strange at first, but it has very 
clear upsides.

The template provides you with basic tests for the adapter startup and package files.
It is recommended that you add your own tests into the mix.

### Publishing the adapter
Using GitHub Actions, you can enable automatic releases on npm whenever you push a new git tag that matches the form 
`v<major>.<minor>.<patch>`. We **strongly recommend** that you do. The necessary steps are described in `.github/workflows/test-and-release.yml`.

To get your adapter released in ioBroker, please refer to the documentation 
of [ioBroker.repositories](https://github.com/ioBroker/ioBroker.repositories#requirements-for-adapter-to-get-added-to-the-latest-repository).

### Test the adapter manually on a local ioBroker installation
In order to install the adapter locally without publishing, the following steps are recommended:
1. Create a GitHub repository for your adapter if you haven't already
1. Push your code to the GitHub repository
1. Use the ioBroker Admin interface or command line to install the adapter from GitHub:
    * **Via Admin UI**: Go to the "Adapters" tab, click on "Custom Install" (GitHub icon), and enter your repository URL:
        ```
        https://github.com/steinwedel/ioBroker.davis
        ```
        You can also install from a specific branch by adding `#branchname` at the end:
        ```
        https://github.com/steinwedel/ioBroker.davis#dev
        ```
    * **Via Command Line**: Install using the `iob` command:
        ```bash
        iob url https://github.com/steinwedel/ioBroker.davis
        ```
        Or from a specific branch:
        ```bash
        iob url https://github.com/steinwedel/ioBroker.davis#dev
        ```

For later updates:
1. Push your changes to GitHub
1. Repeat the installation steps above (via Admin UI or `iob url` command) to update the adapter

## Changelog
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

## License
MIT License

Copyright (c) 2026 steinwedel <steinwedel@example.com>

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