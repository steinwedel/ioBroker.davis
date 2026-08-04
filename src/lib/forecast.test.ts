import { expect } from 'chai';
import {
    buildBrightSkyUrl,
    formatDateForBrightSky,
    processBrightSkyForecast,
    type BrightSkyResponse,
} from './forecast';

describe('lib/forecast formatDateForBrightSky', () => {
    it('formats a date as YYYY-MM-DD with zero-padding', () => {
        expect(formatDateForBrightSky(new Date(2026, 0, 5))).to.equal('2026-01-05');
        expect(formatDateForBrightSky(new Date(2026, 11, 25))).to.equal('2026-12-25');
    });
});

describe('lib/forecast buildBrightSkyUrl', () => {
    it('builds a URL with the expected query parameters', () => {
        const url = buildBrightSkyUrl(52.4153, 9.5891, new Date(2026, 0, 1));
        expect(url).to.include('lat=52.4153');
        expect(url).to.include('lon=9.5891');
        expect(url).to.include('date=2026-01-01');
        expect(url).to.include('last_date=2026-01-08');
        expect(url).to.include('tz=Europe%2FBerlin');
    });
});

describe('lib/forecast processBrightSkyForecast', () => {
    const isDaytime = (hour: number): boolean => hour >= 6 && hour < 20;

    it('groups hourly entries into daily summaries with correct min/max and rainfall totals', () => {
        const response: BrightSkyResponse = {
            weather: [
                {
                    timestamp: '2026-01-01T03:00:00+01:00',
                    temperature: 5,
                    wind_speed: 10,
                    precipitation: 0.5,
                    icon: 'rain',
                    condition: 'rain',
                },
                {
                    timestamp: '2026-01-01T15:00:00+01:00',
                    temperature: 12,
                    wind_speed: 20,
                    precipitation: 1,
                    icon: 'clear-day',
                    condition: 'dry',
                },
            ],
        };

        const days = processBrightSkyForecast(response, isDaytime);
        expect(days).to.have.lengthOf(1);
        expect(days[0].tempMin).to.equal(5);
        expect(days[0].tempMax).to.equal(12);
        expect(days[0].windMin).to.equal(10);
        expect(days[0].windMax).to.equal(20);
        expect(days[0].rainfallMm).to.equal(1.5);
    });

    it('maps each 6-hour block to its closest-to-midpoint icon and German condition title', () => {
        const response: BrightSkyResponse = {
            weather: [
                {
                    timestamp: '2026-01-01T02:00:00+01:00',
                    temperature: 5,
                    wind_speed: 10,
                    precipitation: 0,
                    icon: 'cloudy',
                    condition: 'dry',
                },
                {
                    timestamp: '2026-01-01T03:00:00+01:00', // closer to the 00-06 block's midpoint (3)
                    temperature: 5,
                    wind_speed: 10,
                    precipitation: 0,
                    icon: 'rain',
                    condition: 'rain',
                },
            ],
        };

        const days = processBrightSkyForecast(response, isDaytime);
        expect(days[0].blockIconFile[0]).to.equal('rain');
        expect(days[0].blockTitle[0]).to.equal('Regen');
    });

    it('picks the day/night icon variant for the generic "fog" icon using the isDaytime callback', () => {
        const response: BrightSkyResponse = {
            weather: [
                {
                    timestamp: '2026-01-01T03:00:00+01:00', // night (before 6:00)
                    temperature: 5,
                    wind_speed: 10,
                    precipitation: 0,
                    icon: 'fog',
                    condition: 'fog',
                },
                {
                    timestamp: '2026-01-01T09:00:00+01:00', // day
                    temperature: 5,
                    wind_speed: 10,
                    precipitation: 0,
                    icon: 'fog',
                    condition: 'fog',
                },
            ],
        };

        const days = processBrightSkyForecast(response, isDaytime);
        expect(days[0].blockIconFile[0]).to.equal('fog-night');
        expect(days[0].blockIconFile[1]).to.equal('fog-day');
    });

    it('never returns more days than FORECAST_DAYS even with more distinct dates in the input', () => {
        const weather = Array.from({ length: 20 }, (_, i) => ({
            timestamp: new Date(2026, 0, 1 + i, 12).toISOString(),
            temperature: 10,
            wind_speed: 5,
            precipitation: 0,
            icon: 'clear-day' as const,
            condition: 'dry' as const,
        }));
        const days = processBrightSkyForecast({ weather }, isDaytime);
        expect(days.length).to.be.at.most(8);
    });

    it('returns an empty array for an empty/missing weather array', () => {
        expect(processBrightSkyForecast({ weather: [] }, isDaytime)).to.deep.equal([]);
        expect(processBrightSkyForecast({} as BrightSkyResponse, isDaytime)).to.deep.equal([]);
    });
});
