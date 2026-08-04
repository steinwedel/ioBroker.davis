/**
 * Builds the two HTML snippets shown by the "Wetter" VIS/Jarvis HTML widget:
 *  - the current conditions panel (icon, temperature, wind rose, other current values)
 *  - the multi-day forecast table (fetched from Bright Sky, see `main.ts`)
 *
 * This module contains only pure, side-effect-free rendering functions; all I/O (reading
 * states, calling the Bright Sky API, persisting animation state across calls) is the
 * responsibility of the adapter (`main.ts`), which is what makes these functions easy to
 * unit-test in isolation.
 *
 * Ported from a previous standalone `javascript.0` adapter script of the same purpose; the
 * wind rose animation logic in particular carries over several fixes worked out interactively
 * against a real WeatherLink Live station (180° arrow convention, avoiding rotation animations
 * across a "reveal" after calm wind, matching stroke widths, etc.) - see the inline comments.
 */

/** Duration of the wind rose direction/arc transition animation, in seconds */
const WINDROSE_ANIMATION_S = 1.2;

/**
 * Grace period after the direction needle is (re-)revealed (see `WindRoseAnimationState.wasHidden`)
 * during which further direction changes are still applied immediately instead of animated. A
 * wind vane can take a few seconds to mechanically settle on the true direction after a period of
 * (near-)calm wind, so the first readings right after reveal can still "wobble" briefly; animating
 * each of those corrections would look like the needle is spinning around on its own.
 */
const WINDROSE_SETTLE_MS = 10000;

/** Wind speed (km/h) below which the wind vane's direction reading is considered unreliable */
const CALM_WIND_SPEED_KMH = 1;

/**
 * Animation state that must be persisted across calls to `buildWindRoseSvg()` (by the caller, see
 * `main.ts`) so that direction/arc changes animate smoothly from the previously rendered value
 * instead of jumping, while still avoiding misleading animations right after the needle is
 * hidden/revealed. Starts as `{}` on the first ever call (fresh adapter start).
 */
export interface WindRoseAnimationState {
    /** "Unwrapped" (not normalized to 0-360) last rendered needle rotation, in degrees */
    arrowRotationDeg?: number;
    /** Last rendered "d" path attribute of the 5-minute arc sector, for smooth morphing */
    arcPathD?: string;
    /** Whether the needle was hidden (calm wind) on the previous call */
    wasCalm?: boolean;
    /** Timestamp (`Date.now()`) of the most recent reveal (calm -> not calm transition) */
    revealedAtMs?: number;
}

export interface WindRoseInput {
    /** Current wind direction in degrees (0-360), as reported by the station (0=N, clockwise) */
    directionDeg: number | undefined;
    /** Start boundary angle (degrees) of the smallest arc containing the last 5 minutes of readings */
    minDeg: number | undefined;
    /** End boundary angle (degrees) of the smallest arc containing the last 5 minutes of readings */
    maxDeg: number | undefined;
    /** Current wind speed in km/h; below `CALM_WIND_SPEED_KMH` the needle/arc are hidden */
    windSpeedKmh: number | undefined;
}

/**
 * Chooses, among all angles equivalent to `targetDeg` (mod 360), the one closest to
 * `previousDeg` (shortest rotation distance), so a rotation animation never needlessly spins
 * all the way around when e.g. `targetDeg` changes from 350° to 10° (+20°, not -340°).
 * `previousDeg` may itself be outside the 0-360 range (see `WindRoseAnimationState.arrowRotationDeg`);
 * the result consistently continues that "unwrapped" value.
 *
 * @param previousDeg
 * @param targetDeg
 */
function unwrapAngle(previousDeg: number, targetDeg: number): number {
    const normalizedTarget = ((targetDeg % 360) + 360) % 360;
    const normalizedPrevious = ((previousDeg % 360) + 360) % 360;
    let delta = normalizedTarget - normalizedPrevious;
    delta = ((((delta + 180) % 360) + 360) % 360) - 180;
    return previousDeg + delta;
}

interface XY {
    x: number;
    y: number;
}

type ToXY = (deg: number, radius: number) => XY;

/**
 * Builds the "d" path attribute for the 5-minute arc sector: a simple pie-slice from the
 * compass circle's center between `minDeg` and `maxDeg` at radius `r` - deliberately computed
 * purely from absolute coordinates (no CSS/SVG transforms involved), so the sector always stays
 * exactly concentric with the compass circle.
 *
 * @param toXY
 * @param cx
 * @param cy
 * @param r
 * @param minDeg
 * @param maxDeg
 */
function buildArcPathD(toXY: ToXY, cx: number, cy: number, r: number, minDeg: number, maxDeg: number): string {
    const arcSize = maxDeg >= minDeg ? maxDeg - minDeg : 360 - minDeg + maxDeg;
    const p1 = toXY(minDeg, r);
    const p2 = toXY(maxDeg, r);
    const largeArc = arcSize > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

/**
 * Builds the direction needle markup (shaft, filled tip, V-shaped tail), drawn facing north (0°)
 * as a fixed template - rotation/showing/hiding happens outside this function via the enclosing
 * `<g>` element (see `buildWindRoseSvg()`).
 *
 * Drawing order matters: all black outline strokes are drawn first, then the white inner strokes
 * on top of them (so the outlines never partially cover an already-drawn white stroke), and
 * finally the red filled tip on top of everything.
 *
 * @param toXY
 * @param r
 */
function buildNeedleMarkup(toXY: ToXY, r: number): string {
    const shaftHalfLength = (r * 6) / 4 / 2;
    const shaftFront = toXY(0, shaftHalfLength);
    const shaftBack = toXY(180, shaftHalfLength);
    const tip = toXY(0, r);
    const frontLeft = toXY(-8, shaftHalfLength);
    const frontRight = toXY(8, shaftHalfLength);
    const tailTip = shaftBack;
    const backLeft = toXY(180 - 8, r);
    const backRight = toXY(180 + 8, r);

    const shaftLine = (color: string, width: number): string =>
        `<line x1='${shaftBack.x}' y1='${shaftBack.y}' x2='${shaftFront.x}' y2='${shaftFront.y}' stroke='${color}' stroke-width='${width}' stroke-linecap='round'/>`;
    const tailPolygon = (color: string, width: number): string =>
        `<polygon points='${tailTip.x},${tailTip.y} ${backLeft.x},${backLeft.y} ${backRight.x},${backRight.y}' fill='none' stroke='${color}' stroke-width='${width}' stroke-linejoin='round'/>`;

    let markup = '';
    // 1. All black outline strokes first (shaft, then tail V)
    markup += shaftLine('black', 3.5);
    markup += tailPolygon('black', 3.5);
    // 2. White inner strokes on top, same widths as their black outlines minus the visible border
    markup += shaftLine('white', 2);
    markup += tailPolygon('white', 2);
    // 3. Filled red tip last, on top of everything, without its own outline
    markup += `<polygon points='${tip.x},${tip.y} ${frontLeft.x},${frontLeft.y} ${frontRight.x},${frontRight.y}' fill='red'/>`;
    return markup;
}

/**
 * Builds a small embedded wind rose as inline SVG: a direction needle (0°=north, clockwise) plus
 * a blue arc sector showing the smallest arc containing the last 5 minutes of readings.
 *
 * The needle and arc are shown rotated 180° from the raw station reading, which reports the
 * direction the wind is blowing *from*; the needle instead points in the direction the wind is
 * blowing *to*.
 *
 * At (near-)calm wind, the direction reading is mechanically unreliable, so both the needle and
 * arc are hidden entirely rather than showing a misleading direction/spread. Mutates `state` in
 * place so the caller can persist it across calls for smooth cross-call animation.
 *
 * @param input
 * @param state
 * @returns The SVG markup, or `""` if no direction is available at all
 */
export function buildWindRoseSvg(input: WindRoseInput, state: WindRoseAnimationState): string {
    if (typeof input.directionDeg !== 'number') {
        return '';
    }

    // The needle/arc are shown 180° rotated from the raw "blowing from" reading (see doc comment).
    const directionDeg = (input.directionDeg + 180) % 360;
    const minDeg = typeof input.minDeg === 'number' ? (input.minDeg + 180) % 360 : undefined;
    const maxDeg = typeof input.maxDeg === 'number' ? (input.maxDeg + 180) % 360 : undefined;

    const size = 100;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 14;

    const toXY: ToXY = (deg, radius) => {
        const rad = (deg * Math.PI) / 180;
        return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
    };

    const isCalm = typeof input.windSpeedKmh === 'number' && input.windSpeedKmh < CALM_WIND_SPEED_KMH;

    let svg = `<svg width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>`;

    // Compass circles
    svg += `<circle cx='${cx}' cy='${cy}' r='${r}' fill='none' stroke='Gainsboro' stroke-width='1'/>`;
    svg += `<circle cx='${cx}' cy='${cy}' r='${r * 0.5}' fill='none' stroke='Gainsboro' stroke-width='0.5'/>`;

    // 5-minute arc sector, hidden along with the needle at (near-)calm wind
    const hasRange = !isCalm && typeof minDeg === 'number' && typeof maxDeg === 'number';
    if (hasRange) {
        const arcPathD = buildArcPathD(toXY, cx, cy, r, minDeg, maxDeg);
        const arcPathDFrom = typeof state.arcPathD === 'string' ? state.arcPathD : arcPathD;
        state.arcPathD = arcPathD;
        svg += `<path d='${arcPathD}' fill='rgba(70,130,180,0.35)' stroke='none'>`;
        if (arcPathDFrom !== arcPathD) {
            svg += `<animate attributeName='d' from='${arcPathDFrom}' to='${arcPathD}' dur='${WINDROSE_ANIMATION_S}s' fill='freeze'/>`;
        }
        svg += '</path>';
    }

    // Compass point labels (N/O/S/W); N highlighted in white
    const labels: { deg: number; text: string; color: string }[] = [
        { deg: 0, text: 'N', color: 'white' },
        { deg: 90, text: 'O', color: '#666' },
        { deg: 180, text: 'S', color: '#666' },
        { deg: 270, text: 'W', color: '#666' },
    ];
    for (const label of labels) {
        const lp = toXY(label.deg, r + 9);
        svg += `<text x='${lp.x}' y='${lp.y + 3}' font-size='9' font-weight='bold' text-anchor='middle' fill='${label.color}'>${label.text}</text>`;
    }

    // Direction needle: drawn facing north (0°) as a fixed template (see buildNeedleMarkup) and
    // rotated as a whole around the diagram's center. Hiding/showing happens instantly, without
    // any fade animation. `wasHidden` additionally guards a short settle period right after
    // reveal (see WINDROSE_SETTLE_MS) during which direction corrections are also applied
    // instantly instead of animated, since the vane may still be mechanically settling.
    const wasHidden = state.wasCalm !== false;
    state.wasCalm = isCalm;

    if (isCalm) {
        // Hidden - nothing to draw. Deliberately does NOT update arrowRotationDeg, so the
        // `wasHidden` check above correctly detects "was hidden" the next time this runs.
    } else if (wasHidden) {
        state.arrowRotationDeg = directionDeg;
        state.revealedAtMs = Date.now();
        svg += `<g transform='rotate(${directionDeg} ${cx} ${cy})'>${buildNeedleMarkup(toXY, r)}</g>`;
    } else if (typeof state.revealedAtMs === 'number' && Date.now() - state.revealedAtMs < WINDROSE_SETTLE_MS) {
        state.arrowRotationDeg = directionDeg;
        svg += `<g transform='rotate(${directionDeg} ${cx} ${cy})'>${buildNeedleMarkup(toXY, r)}</g>`;
    } else {
        const arrowFrom = typeof state.arrowRotationDeg === 'number' ? state.arrowRotationDeg : directionDeg;
        const arrowTo = unwrapAngle(arrowFrom, directionDeg);
        state.arrowRotationDeg = arrowTo;

        svg += `<g transform='rotate(${arrowTo} ${cx} ${cy})'>`;
        if (arrowFrom !== arrowTo) {
            svg += `<animateTransform attributeName='transform' type='rotate' from='${arrowFrom} ${cx} ${cy}' to='${arrowTo} ${cx} ${cy}' dur='${WINDROSE_ANIMATION_S}s' fill='freeze'/>`;
        }
        svg += buildNeedleMarkup(toXY, r);
        svg += '</g>';
    }
    svg += `<circle cx='${cx}' cy='${cy}' r='2' fill='SteelBlue'/>`;

    svg += '</svg>';
    return svg;
}

/** Fully-formatted (unit-labeled) current conditions passed in by the adapter */
export interface CurrentConditionsHtmlInput {
    /** Whether the adapter currently has a working connection to the WeatherLink Live */
    isConnected: boolean;
    /** Absolute URL to the current weather condition icon */
    iconUrl: string | undefined;
    /** Formatted temperature, e.g. "20.2°C" */
    temperatureText: string | undefined;
    /** German display text for the current weather condition, e.g. "Bedeckt" */
    weatherStateText: string;
    /** Formatted rainfall today, e.g. "1.2 mm" */
    rainfallTodayText: string | undefined;
    /** Formatted humidity, e.g. "62.1%" */
    humidityText: string | undefined;
    /** Formatted air pressure, e.g. "1012.4 hPa" */
    pressureText: string | undefined;
    /** Formatted sunrise time, e.g. "05:47" */
    sunriseText: string | undefined;
    /** Formatted sunset time, e.g. "21:10" */
    sunsetText: string | undefined;
    /** Wind rose SVG markup built by `buildWindRoseSvg()`, or `""`/`undefined` if unavailable */
    windRoseSvg: string | undefined;
    /** Raw wind direction in degrees (0-360), for the text readout under the wind rose */
    windDirDeg: number | undefined;
    /** Current wind speed in km/h */
    windSpeedKmh: number | undefined;
    /** Current wind gust speed in km/h */
    windGustKmh: number | undefined;
}

/**
 * Builds the "current conditions" HTML panel: icon, temperature, condition text, wind rose
 * (direction/gust), and a small table of other current values.
 *
 * @param input
 */
export function buildCurrentConditionsHtml(input: CurrentConditionsHtmlInput): string {
    let text = '';

    if (!input.isConnected) {
        text +=
            "<div style='background:#c0392b;color:white;font-size:11px;padding:2px 6px;border-radius:3px;margin-bottom:4px;text-align:center'>" +
            'Keine Verbindung zur Wetterstation - Werte ggf. veraltet' +
            '</div>';
    }

    text += '<table><tr><td>';

    // Current conditions: icon + temperature + condition text
    text += '<table><tr>';
    text += '<td>';
    if (input.iconUrl) {
        text += `<img src='${input.iconUrl}' style='width:100px;height:100px;'>`;
    }
    text += '</td>';
    text += '<td vertical-align:top>';
    text += `<font size='8'>${input.temperatureText ?? '?'}</font></td>`;
    text += '</tr><tr>';
    text += '<td align=center>';
    text += input.weatherStateText;
    text += '</td>';
    text += '</tr></table>';

    // Wind rose (direction + 5-minute arc), below the weather display, same (left) column
    const isCalm = typeof input.windSpeedKmh === 'number' && input.windSpeedKmh < CALM_WIND_SPEED_KMH;
    if (input.windRoseSvg) {
        text += `<div style='text-align:center'>${input.windRoseSvg}</div>`;
        // Wind direction (in °, raw from the station, i.e. "from X°" - not the 180°-rotated needle
        // shown above) below the diagram - meaningless at (near-)calm wind, hidden then
        text += "<div style='text-align:center;font-size:11px;color:#666'>";
        if (!isCalm && typeof input.windDirDeg === 'number') {
            text += `${Math.round(input.windDirDeg)}°`;
        }
        text += '</div>';
        // Wind speed (and gust speed) on its own line below - shown as "Windstill" at (near-)calm
        // wind instead of "0 km/h", with the gust parenthetical hidden then since it is meaningless
        text += "<div style='text-align:center;font-size:11px;color:#666'>";
        if (isCalm) {
            text += 'Windstill';
        } else {
            text += `${input.windSpeedKmh} km/h`;
            if (typeof input.windGustKmh === 'number') {
                text += ` (Böen ${input.windGustKmh} km/h)`;
            }
        }
        text += '</div>';
    }

    // Other current values
    text += "<td vertical-align:top style='border-left: 1px solid Gainsboro'>";
    text += '<td>';
    text += '<table>';

    const row = (label: string, value: string | undefined): string =>
        `<tr><td>${label}: </td><td>${value ?? '?'}<br></td></tr>`;

    text += row('Niederschlag heute', input.rainfallTodayText);
    text += row('Feuchte', input.humidityText);
    text += row('Luftdruck', input.pressureText);
    text += row('Sonnenaufgang', input.sunriseText ? `${input.sunriseText} Uhr` : undefined);
    text += row('Sonnenuntergang', input.sunsetText ? `${input.sunsetText} Uhr` : undefined);

    text += '</td></tr>';
    text += '</table>';
    text += '</td>';
    text += '</td>';
    text += '</tr></table>';

    text += '</tr></table>';

    return text;
}

/** A single processed forecast day, ready to render as one table row */
export interface ForecastDay {
    /** Day of week, 0=Sunday..6=Saturday (JS `Date#getDay()` convention) */
    weekday: number;
    tempMin: number;
    tempMax: number;
    windMin: number;
    windMax: number;
    /** Total rainfall for the day, in mm */
    rainfallMm: number;
    /** Icon URL for each of the four 6-hour blocks (00-06/06-12/12-18/18-24), "" if unavailable */
    blockIconUrl: [string, string, string, string];
    /** German condition title for each block, used as the icon's tooltip */
    blockTitle: [string, string, string, string];
}

const WEEKDAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/**
 * Builds the multi-day forecast HTML table from already-processed forecast days (see
 * `processBrightSkyForecast()` in `main.ts`).
 *
 * @param days - The processed forecast days to render, in chronological order
 * @param errorText - If set (e.g. the last Bright Sky fetch failed and no forecast has ever been
 *   fetched successfully yet), shown instead of a (non-existent) table
 */
export function buildForecastHtml(days: ForecastDay[], errorText: string | undefined): string {
    if (days.length === 0) {
        if (errorText) {
            return `<div style='color:#c0392b'>${errorText}</div>`;
        }
        return '<div>Vorhersage wird geladen...</div>';
    }

    let text = '';
    if (errorText) {
        // A forecast is still shown (from a previous successful fetch), but flagged as possibly stale
        text +=
            "<div style='background:#e67e22;color:white;font-size:11px;padding:2px 6px;border-radius:3px;margin-bottom:4px'>" +
            `${errorText} - zeige zuletzt erfolgreich geladene Vorhersage` +
            '</div>';
    }

    text += '<table>';
    text += '<tr>';
    text += "<th valign='top'>Tag</th>";
    text += "<th valign='top'>00-06</th>";
    text += "<th valign='top'>06-12</th>";
    text += "<th valign='top'>12-18</th>";
    text += "<th valign='top'>18-24</th>";
    text += "<th valign='top'>Temperatur</th>";
    text += "<th valign='top'>Niederschlag</th>";
    text += "<th valign='top'>Wind</th>";
    text += '</tr>';

    for (const day of days) {
        text += '<tr>';
        text += `<td>${WEEKDAYS_DE[day.weekday]}</td>`;

        for (let b = 0; b < 4; b++) {
            if (day.blockIconUrl[b]) {
                text += `<td><img src='${day.blockIconUrl[b]}' style='width:20px;height:20px;' title='${day.blockTitle[b]}'></td>`;
            } else {
                text += '<td></td>';
            }
        }

        text += `<td>${Math.round(day.tempMax)}°C/${Math.round(day.tempMin)}°C</td>`;

        const rainRounded = Math.round(day.rainfallMm * 10) / 10;
        text += `<td>${rainRounded > 0 ? `${rainRounded} mm` : ''}</td>`;

        text += `<td>${Math.round(day.windMin)}-${Math.round(day.windMax)} km/h</td>`;
        text += '</tr>';
    }
    text += '</table>';

    text +=
        "<br><small>Wetterdaten: <a href='https://www.dwd.de' target='_blank'>Deutscher Wetterdienst</a> via <a href='https://brightsky.dev' target='_blank'>Bright Sky</a></small>";

    return text;
}
