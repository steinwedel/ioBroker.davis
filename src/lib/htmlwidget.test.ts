import { expect } from 'chai';
import { buildWindRoseSvg, buildCurrentConditionsHtml, type WindRoseAnimationState } from './htmlwidget';

describe('lib/htmlwidget buildWindRoseSvg', () => {
    it('returns an empty string when no direction is available', () => {
        const state: WindRoseAnimationState = {};
        expect(
            buildWindRoseSvg({ directionDeg: undefined, minDeg: undefined, maxDeg: undefined, windSpeedKmh: 5 }, state),
        ).to.equal('');
    });

    it('hides the needle and arc at (near-)calm wind', () => {
        const state: WindRoseAnimationState = {};
        const svg = buildWindRoseSvg({ directionDeg: 90, minDeg: 80, maxDeg: 100, windSpeedKmh: 0.5 }, state);
        expect(svg).to.not.include('<g transform');
        expect(svg).to.not.include('<path d=');
        expect(state.wasCalm).to.be.true;
    });

    it('shows the needle instantly (no animation) on first reveal', () => {
        const state: WindRoseAnimationState = {};
        const svg = buildWindRoseSvg({ directionDeg: 90, minDeg: 80, maxDeg: 100, windSpeedKmh: 5 }, state);
        expect(svg).to.include('<g transform');
        expect(svg).to.not.include('animateTransform');
        expect(state.wasCalm).to.be.false;
    });

    it('rotates the needle 180° from the raw "blowing from" direction', () => {
        const state: WindRoseAnimationState = {};
        buildWindRoseSvg({ directionDeg: 0, minDeg: undefined, maxDeg: undefined, windSpeedKmh: 5 }, state);
        // 0° raw ("from north") should render the needle rotated to 180°
        expect(state.arrowRotationDeg).to.equal(180);
    });

    it('does not animate a direction correction immediately after reveal (settle period)', () => {
        const state: WindRoseAnimationState = {};
        buildWindRoseSvg({ directionDeg: 90, minDeg: undefined, maxDeg: undefined, windSpeedKmh: 5 }, state);
        // A quick correction right after reveal should still snap instantly, not animate
        const svg = buildWindRoseSvg(
            { directionDeg: 150, minDeg: undefined, maxDeg: undefined, windSpeedKmh: 5 },
            state,
        );
        expect(svg).to.not.include('animateTransform');
    });

    it('animates a direction change once already visible and settled', () => {
        const state: WindRoseAnimationState = {
            arrowRotationDeg: 90,
            wasCalm: false,
            revealedAtMs: Date.now() - 60000,
        };
        const svg = buildWindRoseSvg(
            { directionDeg: 20, minDeg: undefined, maxDeg: undefined, windSpeedKmh: 5 },
            state,
        );
        expect(svg).to.include('animateTransform');
    });

    it('does not re-hide arrowRotationDeg while calm, so reveal uses the fresh target angle', () => {
        const state: WindRoseAnimationState = { arrowRotationDeg: 999, wasCalm: false };
        buildWindRoseSvg({ directionDeg: 45, minDeg: undefined, maxDeg: undefined, windSpeedKmh: 0.2 }, state);
        // still holds the stale value while hidden; the *next* reveal call is what resets it
        expect(state.arrowRotationDeg).to.equal(999);
        const svg = buildWindRoseSvg(
            { directionDeg: 45, minDeg: undefined, maxDeg: undefined, windSpeedKmh: 5 },
            state,
        );
        expect(svg).to.not.include('animateTransform');
        expect(state.arrowRotationDeg).to.equal(225); // (45 + 180) % 360
    });
});

describe('lib/htmlwidget buildCurrentConditionsHtml', () => {
    const baseInput = {
        isConnected: true,
        iconUrl: '/adapter/davis/img/weathericons/clear-day.svg',
        temperatureText: '20.2°C',
        weatherStateText: 'Klar',
        rainfallTodayValue: '1.2',
        rainfallTodayUnit: 'mm',
        humidityValue: '62',
        humidityUnit: '%',
        pressureValue: '1012',
        pressureUnit: 'hPa',
        sunriseValue: '05:47',
        sunriseUnit: 'Uhr',
        sunsetValue: '21:10',
        sunsetUnit: 'Uhr',
        windRoseSvg: '<svg></svg>',
        windDirDeg: 90,
        windSpeedKmh: 5,
        windGustKmh: 10,
    };

    it('shows a connection warning banner when not connected', () => {
        const html = buildCurrentConditionsHtml({ ...baseInput, isConnected: false });
        expect(html).to.include('Keine Verbindung');
    });

    it('does not show a connection warning banner when connected', () => {
        const html = buildCurrentConditionsHtml(baseInput);
        expect(html).to.not.include('Keine Verbindung');
    });

    it('shows the wind speed and gust', () => {
        const html = buildCurrentConditionsHtml(baseInput);
        expect(html).to.include('5 km/h');
        expect(html).to.include('Böen 10 km/h');
    });

    it('shows "Windstill" instead of "0 km/h" and hides the gust and direction at calm wind', () => {
        const html = buildCurrentConditionsHtml({ ...baseInput, windSpeedKmh: 0, windGustKmh: 3 });
        expect(html).to.include('Windstill');
        expect(html).to.not.include('0 km/h');
        expect(html).to.not.include('Böen');
        expect(html).to.not.include('90°');
    });

    it('renders the other-values table with separate label/value/unit columns, right-aligning the value', () => {
        const html = buildCurrentConditionsHtml(baseInput);
        expect(html).to.include("text-align:right;padding-left:6px'>1.2</td>");
        expect(html).to.include("text-align:left;padding-left:2px'>mm</td>");
        expect(html).to.include('Niederschlag heute:');
    });

    it('anchors both the left and right column to the top of the row', () => {
        const html = buildCurrentConditionsHtml(baseInput);
        const cells = html.match(/<td style='vertical-align:top[^']*'>/g) ?? [];
        expect(cells.length).to.be.at.least(2);
    });

    it('falls back to "?" for missing values instead of showing "undefined"', () => {
        const html = buildCurrentConditionsHtml({
            ...baseInput,
            temperatureText: undefined,
            humidityValue: undefined,
        });
        expect(html).to.include('?');
        expect(html).to.not.include('undefined');
    });
});
