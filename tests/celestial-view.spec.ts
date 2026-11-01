import { test, expect } from '@playwright/test';
import { calculateCelestial } from '../src/celestial-controller';
import { timestampFromZonedInput } from '../src/calendar-seed';
import { celestialDisplayDirection } from '../src/celestial-view';

test('window composition preserves the astronomical calendar and horizon while moving raised bodies through a continuous low arc', () => {
  for (const date of ['2026-03-20', '2026-06-21', '2026-09-22', '2026-12-21']) {
    let previous: number[] | undefined;
    let earlierAzimuth = -Infinity;
    for (let minute = 0; minute < 1440; minute += 10) {
      const timestamp = timestampFromZonedInput(`${date}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
      const state = calculateCelestial(timestamp), original = structuredClone(state);
      for (const body of [state.sun, state.moon]) {
        const direction = celestialDisplayDirection(body);
        expect(Math.hypot(...direction)).toBeCloseTo(1, 12);
        expect(direction[1] >= 0).toBe(body.altitude >= 0);
        expect(celestialDisplayDirection(body, 'astronomical')).toEqual(body.direction);
        if (body.altitude > 0) {
          expect(Math.asin(direction[1])).toBeLessThanOrEqual(7.5 * Math.PI / 180);
          expect(direction[2]).toBeLessThan(-.9);
        }
      }
      if (state.sun.altitude > 0) {
        const direction = celestialDisplayDirection(state.sun), azimuth = Math.atan2(direction[0], -direction[2]);
        expect(azimuth).toBeGreaterThan(earlierAzimuth);
        earlierAzimuth = azimuth;
        if (previous) expect(Math.hypot(...direction.map((v, i) => v - previous![i]))).toBeLessThan(.025);
        previous = direction;
      }
      expect(state).toEqual(original);
    }
  }
});
