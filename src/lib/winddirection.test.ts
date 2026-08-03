import { expect } from 'chai';
import { getCompassDirection, computeDirectionSpread, computeDirectionRange, isCalmWind } from './winddirection';

describe('lib/winddirection getCompassDirection', () => {
    it('maps the 8 main compass points correctly', () => {
        expect(getCompassDirection(0)).to.equal('N');
        expect(getCompassDirection(45)).to.equal('NO');
        expect(getCompassDirection(90)).to.equal('O');
        expect(getCompassDirection(135)).to.equal('SO');
        expect(getCompassDirection(180)).to.equal('S');
        expect(getCompassDirection(225)).to.equal('SW');
        expect(getCompassDirection(270)).to.equal('W');
        expect(getCompassDirection(315)).to.equal('NW');
    });

    it('maps 360 degrees the same as 0 degrees', () => {
        expect(getCompassDirection(360)).to.equal('N');
    });

    it('maps intermediate directions correctly', () => {
        expect(getCompassDirection(22.5)).to.equal('NNO');
        expect(getCompassDirection(112.5)).to.equal('OSO');
    });

    it('handles values just below a boundary correctly', () => {
        expect(getCompassDirection(11.2)).to.equal('N');
        expect(getCompassDirection(11.3)).to.equal('NNO');
    });

    it('normalizes negative or out-of-range degree values', () => {
        expect(getCompassDirection(-10)).to.equal('N');
        expect(getCompassDirection(370)).to.equal('N');
    });
});

describe('lib/winddirection computeDirectionSpread', () => {
    it('returns undefined for an empty reading list', () => {
        expect(computeDirectionSpread([])).to.be.undefined;
    });

    it('returns 0 for a single reading', () => {
        expect(computeDirectionSpread([180])).to.equal(0);
    });

    it('returns 0 when all readings are identical', () => {
        expect(computeDirectionSpread([90, 90, 90])).to.equal(0);
    });

    it('computes the spread for readings that do not wrap around 0°/360°', () => {
        expect(computeDirectionSpread([80, 100, 90])).to.equal(20);
    });

    it('computes the spread correctly across the 0°/360° wrap-around', () => {
        // 350°, 10°, and 0° are all within a 20° arc around North, not the naive 350° max-min.
        expect(computeDirectionSpread([350, 10, 0])).to.equal(20);
    });

    it('returns less than 360 for readings spread evenly around the full circle', () => {
        // Four points 90° apart: the smallest enclosing arc spans 3 of the 4 equal gaps (270°),
        // not the full 360° - closing the last gap would be redundant since all points are already covered.
        expect(computeDirectionSpread([0, 90, 180, 270])).to.equal(270);
    });

    it('normalizes out-of-range degree values before computing the spread', () => {
        // -10° and 370° both normalize to within a small arc around 0°/360° (350°, 10°, 0°).
        expect(computeDirectionSpread([-10, 370, 0])).to.equal(20);
    });
});

describe('lib/winddirection computeDirectionRange', () => {
    it('returns undefined for an empty reading list', () => {
        expect(computeDirectionRange([])).to.be.undefined;
    });

    it('returns the same angle as both bounds for a single reading', () => {
        expect(computeDirectionRange([180])).to.deep.equal({ min: 180, max: 180 });
    });

    it('returns the same angle as both bounds when all readings are identical', () => {
        expect(computeDirectionRange([90, 90, 90])).to.deep.equal({ min: 90, max: 90 });
    });

    it('computes the bounds for readings that do not wrap around 0°/360°', () => {
        expect(computeDirectionRange([80, 100, 90])).to.deep.equal({ min: 80, max: 100 });
    });

    it('computes the bounds correctly across the 0°/360° wrap-around', () => {
        // 350°, 0°, and 10° all lie within a 20° arc from 350° to 10° (through 0°), not the
        // much larger 340° arc a naive numeric min/max (350 vs 10) would suggest.
        expect(computeDirectionRange([350, 10, 0])).to.deep.equal({ min: 350, max: 10 });
    });

    it('is consistent with computeDirectionSpread for the arc size', () => {
        const directions = [10, 340, 350, 20];
        const range = computeDirectionRange(directions)!;
        const spread = computeDirectionSpread(directions)!;
        // The arc from min to max (going through the wrap-around, if any) must have exactly the
        // reported spread size.
        const arcSize = range.max >= range.min ? range.max - range.min : 360 - range.min + range.max;
        expect(arcSize).to.equal(spread);
    });

    it('normalizes out-of-range degree values before computing the bounds', () => {
        expect(computeDirectionRange([-10, 370, 0])).to.deep.equal({ min: 350, max: 10 });
    });
});

describe('lib/winddirection isCalmWind', () => {
    it('treats zero wind speed as calm', () => {
        expect(isCalmWind(0)).to.be.true;
    });

    it('treats a very low wind speed as calm', () => {
        expect(isCalmWind(0.5)).to.be.true;
    });

    it('does not treat 1 mph or more as calm', () => {
        expect(isCalmWind(1)).to.be.false;
        expect(isCalmWind(5)).to.be.false;
    });
});
