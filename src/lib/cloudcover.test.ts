import { expect } from 'chai';
import { computeCloudCoverHeuristic, computeCloudCoverSolar } from './cloudcover';

describe('lib/cloudcover computeCloudCoverSolar', () => {
    it('returns 0% (clear) when measured radiation matches the clear-sky value at high sun elevation', () => {
        // At 60° elevation, the Haurwitz clear-sky model gives a specific reference value;
        // feeding that same value back in should yield a clear-sky index of ~1 -> 0% cloud cover.
        const elevationDeg = 60;
        const zenithRad = ((90 - elevationDeg) * Math.PI) / 180;
        const clearSky = 1098 * Math.cos(zenithRad) * Math.exp(-0.059 / Math.cos(zenithRad));
        const percent = computeCloudCoverSolar(clearSky, elevationDeg);
        expect(percent).to.equal(0);
    });

    it('returns 100% (overcast) when measured radiation is a small fraction of the clear-sky value', () => {
        const elevationDeg = 45;
        const zenithRad = ((90 - elevationDeg) * Math.PI) / 180;
        const clearSky = 1098 * Math.cos(zenithRad) * Math.exp(-0.059 / Math.cos(zenithRad));
        const percent = computeCloudCoverSolar(clearSky * 0.05, elevationDeg);
        expect(percent).to.equal(100);
    });

    it('returns undefined when the sun is too low above the horizon', () => {
        expect(computeCloudCoverSolar(50, 1)).to.be.undefined;
        expect(computeCloudCoverSolar(0, -5)).to.be.undefined;
    });
});

describe('lib/cloudcover computeCloudCoverHeuristic', () => {
    it('returns ~100% when temperature and dew point are equal (saturated air)', () => {
        const result = computeCloudCoverHeuristic(15, 15);
        expect(result.percent).to.equal(100);
        expect(result.model).to.equal('heuristic');
    });

    it('returns ~0% for a large dew point depression (dry air)', () => {
        const result = computeCloudCoverHeuristic(25, 5);
        expect(result.percent).to.equal(0);
        expect(result.model).to.equal('heuristic');
    });

    it('increases the estimate when the pressure trend is falling', () => {
        const withoutTrend = computeCloudCoverHeuristic(20, 12);
        const withFallingPressure = computeCloudCoverHeuristic(20, 12, -2);
        expect(withFallingPressure.percent).to.be.greaterThan(withoutTrend.percent);
        expect(withFallingPressure.model).to.equal('heuristic+pressure');
    });

    it('decreases the estimate when the pressure trend is rising', () => {
        const withoutTrend = computeCloudCoverHeuristic(20, 12);
        const withRisingPressure = computeCloudCoverHeuristic(20, 12, 2);
        expect(withRisingPressure.percent).to.be.lessThan(withoutTrend.percent);
        expect(withRisingPressure.model).to.equal('heuristic+pressure');
    });

    it('clamps the result to the 0-100 range even with a large pressure adjustment', () => {
        const result = computeCloudCoverHeuristic(15, 15, -10);
        expect(result.percent).to.equal(100);
    });
});
