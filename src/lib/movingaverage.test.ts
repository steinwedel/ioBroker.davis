import { expect } from 'chai';
import { addSample } from './movingaverage';

describe('lib/movingaverage addSample', () => {
    it('returns the value itself as the average for the first sample', () => {
        const result = addSample([], 100, 1000, 60_000);
        expect(result.average).to.equal(100);
        expect(result.samples).to.have.lengthOf(1);
    });

    it('averages multiple samples within the window', () => {
        let state = addSample([], 100, 1000, 60_000);
        state = addSample(state.samples, 200, 2000, 60_000);
        state = addSample(state.samples, 300, 3000, 60_000);
        expect(state.average).to.equal(200);
        expect(state.samples).to.have.lengthOf(3);
    });

    it('discards samples older than the window', () => {
        let state = addSample([], 100, 0, 5000);
        state = addSample(state.samples, 900, 10_000, 5000);
        // The first sample (t=0) is older than the 5s window relative to t=10000, so it's dropped
        expect(state.samples).to.have.lengthOf(1);
        expect(state.average).to.equal(900);
    });

    it('smooths out a single transient dip caused by a passing cloud', () => {
        let state = addSample([], 668, 0, 5 * 60_000);
        state = addSample(state.samples, 668, 20_000, 5 * 60_000);
        state = addSample(state.samples, 374, 40_000, 5 * 60_000); // brief cloud shadow
        state = addSample(state.samples, 668, 60_000, 5 * 60_000);
        // The average (594.5) stays much closer to the "clear" value (668) than the
        // momentary dip (374) would suggest on its own, damping its effect on the estimate.
        expect(state.average).to.be.greaterThan(550);
        expect(state.average).to.be.lessThan(668);
    });
});
