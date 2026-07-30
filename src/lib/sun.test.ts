import { expect } from 'chai';
import { getSolarElevationDeg } from './sun';

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
