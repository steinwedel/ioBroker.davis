import { expect } from 'chai';
import { getSolarElevationDeg, getSunriseSunset } from './sun';

describe('lib/sun getSolarElevationDeg', () => {
    it('returns close to the maximum elevation for local solar noon at the equator on an equinox', () => {
        // 2024-03-20 is close to the March equinox; at solar noon (12:00 UTC at longitude 0)
        // the sun should be very close to overhead at the equator (elevation near 90°).
        const date = new Date('2024-03-20T12:00:00Z');
        const elevation = getSolarElevationDeg(date, 0, 0);
        expect(elevation).to.be.greaterThan(85);
    });

    it('returns a negative elevation at local midnight', () => {
        const date = new Date('2024-06-21T00:00:00Z');
        const elevation = getSolarElevationDeg(date, 52.52, 13.405); // Berlin
        expect(elevation).to.be.lessThan(0);
    });

    it('returns a high positive elevation around local solar noon in summer at mid-latitudes', () => {
        // Berlin, summer solstice, roughly local solar noon (UTC+~0:53 for longitude 13.4°E)
        const date = new Date('2024-06-21T11:00:00Z');
        const elevation = getSolarElevationDeg(date, 52.52, 13.405);
        expect(elevation).to.be.greaterThan(50);
    });
});

describe('lib/sun getSunriseSunset', () => {
    it('returns an earlier sunrise and later sunset in summer than in winter at mid-latitudes', () => {
        const summer = getSunriseSunset(new Date('2024-06-21T00:00:00Z'), 52.52, 13.405); // Berlin
        const winter = getSunriseSunset(new Date('2024-12-21T00:00:00Z'), 52.52, 13.405);
        expect(summer).to.not.be.undefined;
        expect(winter).to.not.be.undefined;
        // Day length (sunset - sunrise) must be much longer in summer than in winter
        const summerDayLengthMs = summer!.sunset.getTime() - summer!.sunrise.getTime();
        const winterDayLengthMs = winter!.sunset.getTime() - winter!.sunrise.getTime();
        expect(summerDayLengthMs).to.be.greaterThan(winterDayLengthMs);
    });

    it('places sunrise before sunset on the same calendar day for temperate latitudes', () => {
        const result = getSunriseSunset(new Date('2024-09-22T00:00:00Z'), 40, 0);
        expect(result).to.not.be.undefined;
        expect(result!.sunrise.getTime()).to.be.lessThan(result!.sunset.getTime());
    });

    it('returns undefined for polar night (sun never rises)', () => {
        // Deep in the polar night at the north pole around the December solstice
        const result = getSunriseSunset(new Date('2024-12-21T00:00:00Z'), 89, 0);
        expect(result).to.be.undefined;
    });
});
