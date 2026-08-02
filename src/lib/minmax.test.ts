import { expect } from 'chai';
import { updateMinMax } from './minmax';

describe('lib/minmax updateMinMax', () => {
    it('records the first value as both min and max for every period', () => {
        const now = new Date(2026, 6, 15, 10, 0, 0);
        const state = updateMinMax(undefined, 20, now);
        expect(state.day.min).to.deep.equal({ value: 20, timestamp: now.getTime() });
        expect(state.day.max).to.deep.equal({ value: 20, timestamp: now.getTime() });
        expect(state.month.min?.value).to.equal(20);
        expect(state.year.min?.value).to.equal(20);
        expect(state.absolute.min?.value).to.equal(20);
    });

    it('updates min/max within the same day', () => {
        const t1 = new Date(2026, 6, 15, 10, 0, 0);
        const t2 = new Date(2026, 6, 15, 14, 0, 0);
        let state = updateMinMax(undefined, 20, t1);
        state = updateMinMax(state, 25, t2);
        expect(state.day.max).to.deep.equal({ value: 25, timestamp: t2.getTime() });
        expect(state.day.min).to.deep.equal({ value: 20, timestamp: t1.getTime() });

        state = updateMinMax(state, 15, new Date(2026, 6, 15, 18, 0, 0));
        expect(state.day.min?.value).to.equal(15);
        expect(state.day.max?.value).to.equal(25);
    });

    it('resets the day bucket but keeps month/year/absolute across a day rollover', () => {
        const day1 = new Date(2026, 6, 15, 23, 0, 0);
        const day2 = new Date(2026, 6, 16, 1, 0, 0);
        let state = updateMinMax(undefined, 30, day1);
        state = updateMinMax(state, 10, day2);

        expect(state.day.min?.value).to.equal(10);
        expect(state.day.max?.value).to.equal(10);
        expect(state.month.min?.value).to.equal(10);
        expect(state.month.max?.value).to.equal(30);
        expect(state.year.max?.value).to.equal(30);
        expect(state.absolute.max?.value).to.equal(30);
    });

    it('resets the month bucket across a month rollover, keeping year/absolute', () => {
        const month1 = new Date(2026, 6, 31, 23, 0, 0);
        const month2 = new Date(2026, 7, 1, 1, 0, 0);
        let state = updateMinMax(undefined, 30, month1);
        state = updateMinMax(state, 5, month2);

        expect(state.month.min?.value).to.equal(5);
        expect(state.month.max?.value).to.equal(5);
        expect(state.year.max?.value).to.equal(30);
        expect(state.absolute.max?.value).to.equal(30);
    });

    it('resets the year bucket across a year rollover, keeping absolute', () => {
        const year1 = new Date(2026, 11, 31, 23, 0, 0);
        const year2 = new Date(2027, 0, 1, 1, 0, 0);
        let state = updateMinMax(undefined, 30, year1);
        state = updateMinMax(state, 5, year2);

        expect(state.year.min?.value).to.equal(5);
        expect(state.year.max?.value).to.equal(5);
        expect(state.absolute.max?.value).to.equal(30);
    });

    it('never resets the absolute bucket', () => {
        let state = updateMinMax(undefined, 30, new Date(2020, 0, 1, 0, 0, 0));
        state = updateMinMax(state, 5, new Date(2026, 11, 31, 0, 0, 0));
        expect(state.absolute.min?.value).to.equal(5);
        expect(state.absolute.max?.value).to.equal(30);
    });
});
