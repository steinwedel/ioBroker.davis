/**
 * Solar position calculation used to determine whether the sun is high
 * enough above the horizon for the solar-radiation-based cloud cover model
 * (see `cloudcover.ts`) to be reliable.
 *
 * Uses a simplified version of the NOAA solar position algorithm, accurate
 * to within about 0.01° for dates between 1950 and 2050 - more than
 * sufficient for a "is it daytime and how high is the sun" check.
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Computes the sun's elevation angle above the horizon for a given time and location.
 *
 * @param date - The UTC date/time to compute the sun position for
 * @param latitudeDeg - Observer latitude in degrees (positive north)
 * @param longitudeDeg - Observer longitude in degrees (positive east)
 * @returns The solar elevation angle in degrees (negative when the sun is below the horizon)
 */
export function getSolarElevationDeg(date: Date, latitudeDeg: number, longitudeDeg: number): number {
    const julianDay = toJulianDay(date);
    const julianCentury = (julianDay - 2451545) / 36525;

    const geomMeanLongSun = normalizeDeg(280.46646 + julianCentury * (36000.76983 + julianCentury * 0.0003032));
    const geomMeanAnomSun = 357.52911 + julianCentury * (35999.05029 - 0.0001537 * julianCentury);
    const eccentEarthOrbit = 0.016708634 - julianCentury * (0.000042037 + 0.0000001267 * julianCentury);

    const sunEqOfCtr =
        Math.sin(geomMeanAnomSun * DEG_TO_RAD) * (1.914602 - julianCentury * (0.004817 + 0.000014 * julianCentury)) +
        Math.sin(2 * geomMeanAnomSun * DEG_TO_RAD) * (0.019993 - 0.000101 * julianCentury) +
        Math.sin(3 * geomMeanAnomSun * DEG_TO_RAD) * 0.000289;

    const sunTrueLong = geomMeanLongSun + sunEqOfCtr;

    const omega = 125.04 - 1934.136 * julianCentury;
    const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG_TO_RAD);

    const meanObliqEcliptic =
        23 +
        (26 + (21.448 - julianCentury * (46.815 + julianCentury * (0.00059 - julianCentury * 0.001813))) / 60) / 60;
    const obliqCorr = meanObliqEcliptic + 0.00256 * Math.cos(omega * DEG_TO_RAD);

    const sunDeclination = Math.asin(Math.sin(obliqCorr * DEG_TO_RAD) * Math.sin(sunAppLong * DEG_TO_RAD)) * RAD_TO_DEG;

    const y = Math.tan((obliqCorr / 2) * DEG_TO_RAD) ** 2;
    const eqTime =
        4 *
        RAD_TO_DEG *
        (y * Math.sin(2 * geomMeanLongSun * DEG_TO_RAD) -
            2 * eccentEarthOrbit * Math.sin(geomMeanAnomSun * DEG_TO_RAD) +
            4 *
                eccentEarthOrbit *
                y *
                Math.sin(geomMeanAnomSun * DEG_TO_RAD) *
                Math.cos(2 * geomMeanLongSun * DEG_TO_RAD) -
            0.5 * y * y * Math.sin(4 * geomMeanLongSun * DEG_TO_RAD) -
            1.25 * eccentEarthOrbit * eccentEarthOrbit * Math.sin(2 * geomMeanAnomSun * DEG_TO_RAD));

    const timeUtcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    const trueSolarTime = (timeUtcMinutes + eqTime + 4 * longitudeDeg) % 1440;

    let hourAngle = trueSolarTime / 4 - 180;
    if (hourAngle < -180) {
        hourAngle += 360;
    }

    const latRad = latitudeDeg * DEG_TO_RAD;
    const decRad = sunDeclination * DEG_TO_RAD;
    const hourAngleRad = hourAngle * DEG_TO_RAD;

    const cosZenith =
        Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngleRad);
    const zenithDeg = Math.acos(Math.min(1, Math.max(-1, cosZenith))) * RAD_TO_DEG;

    return 90 - zenithDeg;
}

/**
 * Converts a JS Date (UTC) to a Julian Day number.
 *
 * @param date - The date to convert
 * @returns The Julian Day number
 */
function toJulianDay(date: Date): number {
    return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Normalizes an angle in degrees to the range [0, 360).
 *
 * @param deg - The angle in degrees
 * @returns The normalized angle in degrees
 */
function normalizeDeg(deg: number): number {
    const result = deg % 360;
    return result < 0 ? result + 360 : result;
}
