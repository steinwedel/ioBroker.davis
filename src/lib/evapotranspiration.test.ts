import { expect } from 'chai';
import { computeEvapotranspiration, computeExtraterrestrialRadiation } from './evapotranspiration';

describe('lib/evapotranspiration computeExtraterrestrialRadiation', () => {
    it('returns a plausible daily extraterrestrial radiation value for mid-latitudes in summer', () => {
        // Ra (theoretical top-of-atmosphere radiation) for mid-latitudes around the summer
        // solstice is typically in the ~35-45 MJ/m²/day range.
        const ra = computeExtraterrestrialRadiation(48, 172);
        expect(ra).to.be.greaterThan(30);
        expect(ra).to.be.lessThan(50);
    });

    it('is symmetric between corresponding northern/southern latitudes half a year apart', () => {
        // The winter solstice for one hemisphere is the summer solstice for the other, so Ra
        // for a given latitude on day 172 (~summer solstice) should match Ra for the mirrored
        // latitude on day 355 (~winter solstice) within the astronomical formula's precision.
        const northernSummer = computeExtraterrestrialRadiation(45, 172);
        const southernSummer = computeExtraterrestrialRadiation(-45, 355);
        expect(northernSummer).to.be.closeTo(southernSummer, 4);
    });

    it('returns higher radiation near the equator than at high latitudes around the equinox', () => {
        const equatorEquinox = computeExtraterrestrialRadiation(0, 80);
        const highLatitudeEquinox = computeExtraterrestrialRadiation(65, 80);
        expect(equatorEquinox).to.be.greaterThan(highLatitudeEquinox);
    });
});

describe('lib/evapotranspiration computeEvapotranspiration', () => {
    it('returns undefined when the max temperature is below the min temperature', () => {
        expect(computeEvapotranspiration(20, 10, 45, new Date('2026-07-01'))).to.be.undefined;
    });

    it('returns 0 for identical min/max temperatures (no diurnal range)', () => {
        const result = computeEvapotranspiration(15, 15, 45, new Date('2026-07-01'));
        expect(result).to.equal(0);
    });

    it('increases with a larger day/night temperature range', () => {
        const date = new Date('2026-07-01');
        const small = computeEvapotranspiration(15, 20, 45, date)!;
        const large = computeEvapotranspiration(10, 30, 45, date)!;
        expect(large).to.be.greaterThan(small);
    });

    it('returns a plausible daily ETo estimate for a warm summer day at mid-latitude', () => {
        const result = computeEvapotranspiration(15, 28, 48, new Date('2026-07-01'))!;
        expect(result).to.be.greaterThan(1);
        expect(result).to.be.lessThan(10);
    });
});
