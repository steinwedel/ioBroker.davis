import { expect } from 'chai';
import { isFrostRisk } from './frost';

describe('lib/frost isFrostRisk', () => {
    it('reports frost risk at or below 0°C', () => {
        expect(isFrostRisk(0)).to.be.true;
        expect(isFrostRisk(-5)).to.be.true;
    });

    it('reports no frost risk above 0°C', () => {
        expect(isFrostRisk(0.1)).to.be.false;
        expect(isFrostRisk(20)).to.be.false;
    });
});
