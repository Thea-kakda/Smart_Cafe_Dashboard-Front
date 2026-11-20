import React, { useState, useRef } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export interface TrendDataPoint {
  label: string;
  value: number;
}

export interface InteractiveTrendLineProps {
  data: TrendDataPoint[];
  previousPeriodValue: number;
  color?: string; // hex or tailwind-compatible color
  formatValue?: (val: number) => string;
  height?: number;
  periodLabel?: string;
}

export function calculateGrowth(current: number, previous: number): {
  percent: number;
  formatted: string;
  isPositive: boolean;
  isNeutral: boolean;
} {
  if (previous === 0) {
    if (current === 0) return { percent: 0, formatted: '0.0%', isPositive: true, isNeutral: true };
    return { percent: 100, formatted: '+100%', isPositive: true, isNeutral: false };
  }
  const diff = current - previous;
  const pct = (diff / Math.abs(previous)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return {
    percent: rounded,
    formatted: `${sign}${rounded.toFixed(1)}%`,
    isPositive: rounded > 0,
    isNeutral: rounded === 0,
  };
}

export const InteractiveTrendLine: React.FC<InteractiveTrendLineProps> = ({
  data,
  previousPeriodValue,
  color = '#2E7D32',
  formatValue = (v) => v.toString(),
  height = 42,
  periodLabel = 'vs prev. period',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length < 2) return null;

  const currentVal = data[data.length - 1].value;
  const growth = calculateGrowth(currentVal, previousPeriodValue);

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;

  const width = 160;
  const paddingX = 4;
  const paddingY = 6;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  // Calculate points
  const points = data.map((d, index) => {
    const x = paddingX + (index / (data.length - 1)) * innerWidth;
    const y = height - paddingY - ((d.value - minVal) / range) * innerHeight;
    return { x, y, ...d };
  });

  // Construct SVG path line
  const linePath = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
  }, '');

  // Construct SVG area path
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  // Unique ID for gradient
  const gradientId = `trend-gradient-${color.replace('#', '')}-${Math.random().toString(36).substr(2, 5)}`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const boundedX = Math.max(0, Math.min(mouseX, rect.width));
    const ratio = boundedX / rect.width;
    const rawIdx = Math.round(ratio * (data.length - 1));
    const clampedIdx = Math.max(0, Math.min(data.length - 1, rawIdx));
    setHoverIndex(clampedIdx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="flex flex-col space-y-1.5 w-full">
      {/* Growth Metric Badge */}
      <div className="flex items-center justify-between text-[11px]">
        <div
          className={`inline-flex items-center gap-1 font-bold ${
            growth.isNeutral
              ? 'text-[#8C7C6B]'
              : growth.isPositive
              ? 'text-[#2E7D32]'
              : 'text-[#DC2626]'
          }`}
        >
          {growth.isNeutral ? (
            <Minus className="w-3 h-3" />
          ) : growth.isPositive ? (
            <ArrowUpRight className="w-3.5 h-3.5" />
          ) : (
            <ArrowDownRight className="w-3.5 h-3.5" />
          )}
          <span>{growth.formatted}</span>
        </div>
        <span className="text-[10px] text-[#8C7C6B] dark:text-[#A89D94] font-medium">
          {periodLabel}
        </span>
      </div>

      {/* Interactive Trend SVG Canvas */}
      <div 
        ref={containerRef}
        className="relative w-full h-[44px] overflow-visible select-none"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible cursor-crosshair"
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* Line stroke */}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Key point dots */}
          {points.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={hoverIndex === i ? 4.5 : i === points.length - 1 ? 3 : 1.5}
              fill={hoverIndex === i ? '#FFFFFF' : color}
              stroke={color}
              strokeWidth={hoverIndex === i ? 2 : 1}
              className="transition-all duration-150"
            />
          ))}

          {/* Vertical scrub guideline */}
          {activePoint && (
            <line
              x1={activePoint.x}
              y1={0}
              x2={activePoint.x}
              y2={height}
              stroke={color}
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.6"
            />
          )}
        </svg>

        {/* Hover interactive tooltip bubble */}
        {activePoint && (
          <div
            className="pointer-events-none absolute -top-8 z-30 transform -translate-x-1/2 rounded-md bg-[#1C1A19] dark:bg-[#F5F3F0] px-2 py-0.5 text-[10px] font-bold text-white dark:text-[#1C1A19] shadow-md whitespace-nowrap animate-in fade-in duration-100"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
            }}
          >
            <span className="opacity-75 mr-1 font-normal">{activePoint.label}:</span>
            <span>{formatValue(activePoint.value)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
