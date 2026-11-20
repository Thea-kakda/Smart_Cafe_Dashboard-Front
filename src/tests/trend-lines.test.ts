import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateGrowth, TrendDataPoint } from '../components/dashboard/InteractiveTrendLine';

describe('Interactive Trend Lines & KPI Growth Tests', () => {
  // 1. Positive Growth Calculation
  it('calculates positive percentage growth compared to previous period', () => {
    const current = 1482.50;
    const previous = 1367.60;
    const growth = calculateGrowth(current, previous);

    assert.strictEqual(growth.isPositive, true);
    assert.strictEqual(growth.isNeutral, false);
    assert.strictEqual(growth.formatted, '+8.4%');
    assert.strictEqual(growth.percent, 8.4);
  });

  // 2. Negative Growth Calculation
  it('calculates negative percentage growth compared to previous period', () => {
    const current = 3;
    const previous = 4;
    const growth = calculateGrowth(current, previous);

    assert.strictEqual(growth.isPositive, false);
    assert.strictEqual(growth.isNeutral, false);
    assert.strictEqual(growth.formatted, '-25.0%');
    assert.strictEqual(growth.percent, -25.0);
  });

  // 3. Neutral Growth Calculation
  it('calculates 0% neutral growth when values are identical', () => {
    const growth = calculateGrowth(100, 100);

    assert.strictEqual(growth.isNeutral, true);
    assert.strictEqual(growth.formatted, '0.0%');
    assert.strictEqual(growth.percent, 0);
  });

  // 4. Edge Cases: Zero previous value
  it('handles edge case when previous period value was 0', () => {
    const growthFromZero = calculateGrowth(50, 0);
    assert.strictEqual(growthFromZero.isPositive, true);
    assert.strictEqual(growthFromZero.percent, 100);

    const growthBothZero = calculateGrowth(0, 0);
    assert.strictEqual(growthBothZero.isNeutral, true);
    assert.strictEqual(growthBothZero.percent, 0);
  });

  // 5. Data Point Coordinate Mapping
  it('correctly maps values to bounded normalized SVG vertical coordinates', () => {
    const points: TrendDataPoint[] = [
      { label: 'Day 1', value: 100 },
      { label: 'Day 2', value: 200 },
      { label: 'Day 3', value: 150 },
    ];
    const height = 40;
    const paddingY = 6;
    const innerHeight = height - paddingY * 2; // 28
    const minVal = 100;
    const maxVal = 200;
    const range = maxVal - minVal; // 100

    const y0 = height - paddingY - ((points[0].value - minVal) / range) * innerHeight;
    const y1 = height - paddingY - ((points[1].value - minVal) / range) * innerHeight;
    const y2 = height - paddingY - ((points[2].value - minVal) / range) * innerHeight;

    assert.strictEqual(y0, 34); // minimum value is at the bottom (higher y)
    assert.strictEqual(y1, 6);  // maximum value is at the top (lower y)
    assert.strictEqual(y2, 20); // midway value is at y=20
  });
});
