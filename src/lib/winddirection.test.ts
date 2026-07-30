import { expect } from 'chai';
import { getCompassDirection } from './winddirection';

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
