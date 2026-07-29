/**
 * Unit conversion helpers for displaying WeatherLink Live values in metric or
 * imperial units. The Local API always reports values in imperial units
 * (°F, mph, inHg); when the user selects "metric" in the adapter config,
 * matching fields are converted before being written to their states.
 */

export type UnitSystem = 'metric' | 'imperial';

/** Physical quantities that have different units/scales between metric and imperial */
export type UnitKind = 'temperature' | 'windSpeed' | 'pressure';

const UNIT_LABELS: Record<UnitKind, Record<UnitSystem, string>> = {
    temperature: { metric: '°C', imperial: '°F' },
    windSpeed: { metric: 'km/h', imperial: 'mph' },
    pressure: { metric: 'hPa', imperial: 'inHg' },
};

/**
 * Returns the unit label to display for a given quantity and unit system.
 *
 * @param kind - The physical quantity being displayed
 * @param units - The unit system currently selected in the adapter config
 * @returns The unit label, e.g. "°C" or "mph"
 */
export function getUnitLabel(kind: UnitKind, units: UnitSystem): string {
    return UNIT_LABELS[kind][units];
}

/**
 * Converts a raw value (always reported in imperial units by the Local API)
 * to the unit system selected by the user. Imperial input is passed through unchanged.
 *
 * @param value - The raw numeric value as reported by the WeatherLink Live (imperial)
 * @param kind - The physical quantity being converted
 * @param units - The unit system to convert to
 * @returns The converted value, rounded to one decimal place
 */
export function convertValue(value: number, kind: UnitKind, units: UnitSystem): number {
    if (units === 'imperial') {
        return value;
    }
    let converted: number;
    switch (kind) {
        case 'temperature':
            converted = ((value - 32) * 5) / 9;
            break;
        case 'windSpeed':
            converted = value * 1.609344;
            break;
        case 'pressure':
            converted = value * 33.8639;
            break;
    }
    return Math.round(converted * 10) / 10;
}

/**
 * Rain collector tip sizes as reported by the WeatherLink Live's `rain_size` field:
 * 1 = 0.01 in, 2 = 0.2 mm, 3 = 0.1 mm, 4 = 0.001 in. Values are expressed in inches
 * so that a raw tip count can always be multiplied by this factor first.
 */
const RAIN_TIP_SIZE_INCHES: Record<number, number> = {
    1: 0.01,
    2: 0.2 / 25.4,
    3: 0.1 / 25.4,
    4: 0.001,
};

/** Tip size assumed when the device does not report `rain_size` (standard 0.01 in / 0.254 mm US collector) */
const DEFAULT_RAIN_TIP_SIZE_INCHES = RAIN_TIP_SIZE_INCHES[1];

/**
 * Returns the unit label for a rain quantity.
 *
 * @param units - The unit system currently selected in the adapter config
 * @param isRate - Whether the quantity is a rate (per hour) rather than an accumulated amount
 * @returns The unit label, e.g. "mm", "mm/h", "in" or "in/h"
 */
export function getRainUnitLabel(units: UnitSystem, isRate = false): string {
    const base = units === 'metric' ? 'mm' : 'in';
    return isRate ? `${base}/h` : base;
}

/**
 * Converts a raw rain tip count (as reported by the WeatherLink Live) into a physical
 * rainfall depth, using the collector's tip size (`rain_size`) to determine how much
 * rain a single count represents.
 *
 * @param count - The raw tip count (or counts/hour for rate fields) reported by the device
 * @param rainSizeCode - The `rain_size` code from the same condition record, if available
 * @param units - The unit system to convert to
 * @returns The rainfall depth in mm (metric) or inches (imperial), rounded appropriately
 */
export function convertRainCount(count: number, rainSizeCode: number | null | undefined, units: UnitSystem): number {
    const tipSizeInches =
        rainSizeCode !== null && rainSizeCode !== undefined && rainSizeCode in RAIN_TIP_SIZE_INCHES
            ? RAIN_TIP_SIZE_INCHES[rainSizeCode]
            : DEFAULT_RAIN_TIP_SIZE_INCHES;

    const inches = count * tipSizeInches;
    if (units === 'imperial') {
        return Math.round(inches * 1000) / 1000;
    }
    return Math.round(inches * 25.4 * 10) / 10;
}
