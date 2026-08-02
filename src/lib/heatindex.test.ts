import { expect } from 'chai';
import { getHeatRiskLevel, getHeatRiskLevelLabel } from './heatindex';

describe('lib/heatindex getHeatRiskLevel', () => {
    it('classifies mild heat index values as no risk', () => {
        expect(getHeatRiskLevel(20)).to.equal('none');
        expect(getHeatRiskLevel(26)).to.equal('none');
    });

    it('classifies caution-range heat index values', () => {
        expect(getHeatRiskLevel(26.7)).to.equal('caution');
        expect(getHeatRiskLevel(30)).to.equal('caution');
    });

    it('classifies extreme-caution-range heat index values', () => {
        expect(getHeatRiskLevel(32.2)).to.equal('extremeCaution');
        expect(getHeatRiskLevel(35)).to.equal('extremeCaution');
    });

    it('classifies danger-range heat index values', () => {
        expect(getHeatRiskLevel(39.4)).to.equal('danger');
        expect(getHeatRiskLevel(45)).to.equal('danger');
    });

    it('classifies extreme-danger-range heat index values', () => {
        expect(getHeatRiskLevel(51.1)).to.equal('extremeDanger');
        expect(getHeatRiskLevel(60)).to.equal('extremeDanger');
    });
});

describe('lib/heatindex getHeatRiskLevelLabel', () => {
    it('returns the German label for each category', () => {
        expect(getHeatRiskLevelLabel(20)).to.equal('Keine');
        expect(getHeatRiskLevelLabel(28)).to.equal('Vorsicht');
        expect(getHeatRiskLevelLabel(35)).to.equal('Erhöhte Vorsicht');
        expect(getHeatRiskLevelLabel(42)).to.equal('Gefahr');
        expect(getHeatRiskLevelLabel(55)).to.equal('Extreme Gefahr');
    });
});
