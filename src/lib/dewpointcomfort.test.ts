import { expect } from 'chai';
import { getDewPointComfortLevel, getDewPointComfortLevelLabel } from './dewpointcomfort';

describe('lib/dewpointcomfort getDewPointComfortLevel', () => {
    it('classifies low dew points as dry', () => {
        expect(getDewPointComfortLevel(0)).to.equal('dry');
        expect(getDewPointComfortLevel(12.7)).to.equal('dry');
    });

    it('classifies moderate dew points as comfortable', () => {
        expect(getDewPointComfortLevel(12.8)).to.equal('comfortable');
        expect(getDewPointComfortLevel(18)).to.equal('comfortable');
    });

    it('classifies higher dew points as humid', () => {
        expect(getDewPointComfortLevel(18.3)).to.equal('humid');
        expect(getDewPointComfortLevel(23)).to.equal('humid');
    });

    it('classifies very high dew points as oppressive', () => {
        expect(getDewPointComfortLevel(23.9)).to.equal('oppressive');
        expect(getDewPointComfortLevel(28)).to.equal('oppressive');
    });
});

describe('lib/dewpointcomfort getDewPointComfortLevelLabel', () => {
    it('returns the German label for each category', () => {
        expect(getDewPointComfortLevelLabel(5)).to.equal('Trocken');
        expect(getDewPointComfortLevelLabel(15)).to.equal('Angenehm');
        expect(getDewPointComfortLevelLabel(20)).to.equal('Schwül');
        expect(getDewPointComfortLevelLabel(25)).to.equal('Sehr schwül');
    });
});
