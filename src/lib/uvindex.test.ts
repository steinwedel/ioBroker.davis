import { expect } from 'chai';
import { getUvRiskLevel, getUvRiskLevelLabel } from './uvindex';

describe('lib/uvindex getUvRiskLevel', () => {
    it('classifies low UV index values', () => {
        expect(getUvRiskLevel(0)).to.equal('low');
        expect(getUvRiskLevel(2)).to.equal('low');
    });

    it('classifies moderate UV index values', () => {
        expect(getUvRiskLevel(3)).to.equal('moderate');
        expect(getUvRiskLevel(5)).to.equal('moderate');
    });

    it('classifies high UV index values', () => {
        expect(getUvRiskLevel(6)).to.equal('high');
        expect(getUvRiskLevel(7)).to.equal('high');
    });

    it('classifies very high UV index values', () => {
        expect(getUvRiskLevel(8)).to.equal('veryHigh');
        expect(getUvRiskLevel(10)).to.equal('veryHigh');
    });

    it('classifies extreme UV index values', () => {
        expect(getUvRiskLevel(11)).to.equal('extreme');
        expect(getUvRiskLevel(15)).to.equal('extreme');
    });
});

describe('lib/uvindex getUvRiskLevelLabel', () => {
    it('returns the German label for each category', () => {
        expect(getUvRiskLevelLabel(1)).to.equal('Niedrig');
        expect(getUvRiskLevelLabel(4)).to.equal('Mäßig');
        expect(getUvRiskLevelLabel(6.5)).to.equal('Hoch');
        expect(getUvRiskLevelLabel(9)).to.equal('Sehr hoch');
        expect(getUvRiskLevelLabel(12)).to.equal('Extrem');
    });
});
