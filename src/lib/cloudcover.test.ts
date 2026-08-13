import { expect } from 'chai';
import {
    clearSkyIrradiance,
    computeCloudCoverHeuristic,
    computeCloudCoverSolar,
    scaleLearnedClearSky,
} from './cloudcover';

describe('lib/cloudcover computeCloudCoverSolar', () => {
    it('returns 0% (clear) when measured radiation matches the clear-sky value at high sun elevation', () => {
        const elevationDeg = 60;
        const percent = computeCloudCoverSolar(clearSkyIrradiance(elevationDeg), elevationDeg);
        expect(percent).to.equal(0);
    });

    it('returns 100% (overcast) when measured radiation is a small fraction of the clear-sky value', () => {
        const elevationDeg = 45;
        const percent = computeCloudCoverSolar(clearSkyIrradiance(elevationDeg) * 0.05, elevationDeg);
        expect(percent).to.equal(100);
    });

    it('returns undefined when the sun is too low above the horizon', () => {
        expect(computeCloudCoverSolar(50, 1)).to.be.undefined;
        expect(computeCloudCoverSolar(200, 7)).to.be.undefined;
        expect(computeCloudCoverSolar(0, -5)).to.be.undefined;
    });

    it('uses a learned clear-sky reference instead of the Haurwitz formula when provided', () => {
        const percent = computeCloudCoverSolar(329, 28.3, 329);
        expect(percent).to.equal(0);
    });

    it('reads as cloudier than the learned reference when the reading falls short of it', () => {
        const percent = computeCloudCoverSolar(200, 28.3, 400);
        expect(percent).to.be.greaterThan(0);
    });

    it('treats a typical clear day below the historical bucket maximum as clear', () => {
        const elevationDeg = 28.3;
        const learnedMax = 400;
        const typicalClear = scaleLearnedClearSky(learnedMax, elevationDeg) * 0.85;
        const percent = computeCloudCoverSolar(typicalClear, elevationDeg, learnedMax);
        expect(percent).to.equal(0);
    });

    it('does not report high cloud cover for a moderately reduced morning reading against a bucket max', () => {
        const elevationDeg = 22;
        const learnedMax = 450;
        const morningClear = scaleLearnedClearSky(learnedMax, elevationDeg) * 0.8;
        const percent = computeCloudCoverSolar(morningClear, elevationDeg, learnedMax);
        expect(percent).to.be.at.most(10);
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

    it('returns 0% for a typical clear humid morning (depression ~4 °C)', () => {
        const result = computeCloudCoverHeuristic(16, 12);
        expect(result.percent).to.equal(0);
    });

    it('increases the estimate when the pressure trend is falling', () => {
        const withoutTrend = computeCloudCoverHeuristic(18, 15);
        const withFallingPressure = computeCloudCoverHeuristic(18, 15, -2);
        expect(withFallingPressure.percent).to.be.greaterThan(withoutTrend.percent);
        expect(withFallingPressure.model).to.equal('heuristic+pressure');
    });

    it('decreases the estimate when the pressure trend is rising', () => {
        const withoutTrend = computeCloudCoverHeuristic(18, 15);
        const withRisingPressure = computeCloudCoverHeuristic(18, 15, 2);
        expect(withRisingPressure.percent).to.be.lessThan(withoutTrend.percent);
        expect(withRisingPressure.model).to.equal('heuristic+pressure');
    });

    it('clamps the result to the 0-100 range even with a large pressure adjustment', () => {
        const result = computeCloudCoverHeuristic(15, 15, -10);
        expect(result.percent).to.equal(100);
    });
});
