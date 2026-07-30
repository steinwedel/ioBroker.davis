import { expect } from 'chai';
import { computeWeatherIcon } from './weathericon';

describe('lib/weathericon computeWeatherIcon', () => {
    it('returns undefined when neither cloud cover nor an active rain sensor is available', () => {
        expect(computeWeatherIcon({ isDay: true })).to.be.undefined;
        expect(computeWeatherIcon({ rainRateLast: 0, isDay: true })).to.be.undefined;
    });

    it('classifies low cloud cover as clear', () => {
        const result = computeWeatherIcon({ cloudCoverPercent: 5, isDay: true });
        expect(result?.state).to.equal('clear');
        expect(result?.iconPath).to.equal('img/weathericons/clear-day.svg');
    });

    it('uses the night icon variant when the sun is below the horizon', () => {
        const result = computeWeatherIcon({ cloudCoverPercent: 5, isDay: false });
        expect(result?.state).to.equal('clear');
        expect(result?.iconPath).to.equal('img/weathericons/clear-night.svg');
    });

    it('classifies high cloud cover as overcast', () => {
        const result = computeWeatherIcon({ cloudCoverPercent: 95, isDay: true });
        expect(result?.state).to.equal('overcast');
    });

    it('classifies moderate cloud cover as partly cloudy', () => {
        const result = computeWeatherIcon({ cloudCoverPercent: 50, isDay: true });
        expect(result?.state).to.equal('partlyCloudy');
    });

    it('classifies active rain with a warm temperature as rain', () => {
        const result = computeWeatherIcon({ cloudCoverPercent: 80, rainRateLast: 1, tempC: 10, isDay: true });
        expect(result?.state).to.equal('rain');
    });

    it('classifies active rain with a cold temperature as snow', () => {
        const result = computeWeatherIcon({ cloudCoverPercent: 80, rainRateLast: 1, tempC: -2, isDay: true });
        expect(result?.state).to.equal('snow');
    });

    it('classifies heavy rain with overcast skies as a thunderstorm candidate', () => {
        const result = computeWeatherIcon({ cloudCoverPercent: 90, rainRateLast: 10, tempC: 20, isDay: true });
        expect(result?.state).to.equal('thunderstorm');
    });

    it('does not classify heavy rain as thunderstorm without cloud cover confirmation', () => {
        const result = computeWeatherIcon({ rainRateLast: 10, tempC: 20, isDay: true });
        expect(result?.state).to.equal('rain');
    });

    it('classifies calm, near-saturated conditions without rain as fog', () => {
        const result = computeWeatherIcon({
            cloudCoverPercent: 60,
            dewPointDepressionC: 0.2,
            windSpeed: 2,
            isDay: true,
        });
        expect(result?.state).to.equal('fog');
    });

    it('does not classify near-saturated conditions as fog when windy', () => {
        const result = computeWeatherIcon({
            cloudCoverPercent: 60,
            dewPointDepressionC: 0.2,
            windSpeed: 25,
            isDay: true,
        });
        expect(result?.state).to.not.equal('fog');
    });

    it('returns a rain-only estimate when a rain sensor is active but no cloud cover is available', () => {
        const result = computeWeatherIcon({ rainRateLast: 1, tempC: 10, isDay: true });
        expect(result?.state).to.equal('rain');
    });
});
