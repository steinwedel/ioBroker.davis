import { expect } from 'chai';
import { getReference, recordObservation } from './clearskyreference';

describe('lib/clearskyreference', () => {
    const day = 24 * 60 * 60 * 1000;

    it('returns undefined for a bucket with no observations yet', () => {
        expect(getReference({}, 30, Date.now())).to.be.undefined;
    });

    it('records the first observation as the reference for its bucket', () => {
        const now = Date.now();
        const map = recordObservation({}, 32, 450, now);
        expect(getReference(map, 32, now)).to.equal(450);
    });

    it('groups elevations into the same 5° bucket', () => {
        const now = Date.now();
        const map = recordObservation({}, 31, 450, now);
        // 33° falls in the same [30,35) bucket as 31°
        expect(getReference(map, 33, now)).to.equal(450);
        // 37° falls in a different [35,40) bucket
        expect(getReference(map, 37, now)).to.be.undefined;
    });

    it('updates the reference when a higher value is observed', () => {
        const now = Date.now();
        let map = recordObservation({}, 40, 500, now);
        map = recordObservation(map, 41, 600, now + 1000);
        expect(getReference(map, 40, now + 1000)).to.equal(600);
    });

    it('keeps the existing (higher) reference when a lower value is observed', () => {
        const now = Date.now();
        let map = recordObservation({}, 40, 600, now);
        map = recordObservation(map, 41, 300, now + 1000);
        expect(getReference(map, 40, now + 1000)).to.equal(600);
    });

    it('does not decay a reference within the rolling window', () => {
        const now = Date.now();
        const map = recordObservation({}, 40, 500, now);
        expect(getReference(map, 40, now + 10 * day)).to.equal(500);
    });

    it('decays a reference that has not been challenged for longer than the rolling window', () => {
        const now = Date.now();
        const map = recordObservation({}, 40, 500, now);
        const decayed = getReference(map, 40, now + 20 * day)!;
        expect(decayed).to.be.lessThan(500);
        expect(decayed).to.be.greaterThan(400);
    });

    it('allows a new observation to override a decayed reference even if numerically lower than the original max', () => {
        const now = Date.now();
        let map = recordObservation({}, 40, 500, now);
        // After 30 days, the decayed reference is well below 500; a new 480 observation should still win.
        map = recordObservation(map, 41, 480, now + 30 * day);
        expect(getReference(map, 40, now + 30 * day)).to.equal(480);
    });
});
