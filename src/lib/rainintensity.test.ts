import { expect } from 'chai';
import { getRainIntensityLevel, getRainIntensityLevelLabel } from './rainintensity';

describe('lib/rainintensity getRainIntensityLevel', () => {
    it('classifies zero rain rate as none', () => {
        expect(getRainIntensityLevel(0)).to.equal('none');
    });

    it('classifies light rain rates', () => {
        expect(getRainIntensityLevel(0.1)).to.equal('light');
        expect(getRainIntensityLevel(2.5)).to.equal('light');
    });

    it('classifies moderate rain rates', () => {
        expect(getRainIntensityLevel(2.6)).to.equal('moderate');
        expect(getRainIntensityLevel(7.6)).to.equal('moderate');
    });

    it('classifies heavy rain rates', () => {
        expect(getRainIntensityLevel(7.7)).to.equal('heavy');
        expect(getRainIntensityLevel(50)).to.equal('heavy');
    });

    it('classifies very heavy rain rates', () => {
        expect(getRainIntensityLevel(50.1)).to.equal('veryHeavy');
        expect(getRainIntensityLevel(100)).to.equal('veryHeavy');
    });
});

describe('lib/rainintensity getRainIntensityLevelLabel', () => {
    it('returns the German label for each category', () => {
        expect(getRainIntensityLevelLabel(0)).to.equal('Kein Niederschlag');
        expect(getRainIntensityLevelLabel(1)).to.equal('Leicht');
        expect(getRainIntensityLevelLabel(5)).to.equal('Mäßig');
        expect(getRainIntensityLevelLabel(20)).to.equal('Stark');
        expect(getRainIntensityLevelLabel(60)).to.equal('Sehr stark');
    });
});
