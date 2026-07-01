/**
 * RadarChart.tsx — SVG radar chart for taste profile visualization.
 * Renders a spider/radar chart showing how the user's preferences
 * distribute across genres, languages, etc.
 *
 * Pure SVG — no canvas or third-party library.
 */

import { useMemo } from "react";

type RadarPoint = {
  label: string;
  value: number;   // 0–1 normalized
  color?: string;   // optional per-axis color
};

type RadarChartProps = {
  data: RadarPoint[];
  size?: number;
  levels?: number;   // number of concentric rings
  className?: string;
};

export function RadarChart({ data, size = 280, levels = 4, className }: RadarChartProps) {
  const center = size / 2;
  const radius = size * 0.38;  // leave room for labels
  const angleStep = (2 * Math.PI) / data.length;

  const { gridLines, axisLines, dataPolygon, labels, dots } = useMemo(() => {
    // Concentric ring grid
    const gridLines = Array.from({ length: levels }, (_, i) => {
      const r = (radius / levels) * (i + 1);
      const points = data.map((_, j) => {
        const angle = angleStep * j - Math.PI / 2;
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
      }).join(" ");
      return { points, r, i };
    });

    // Axis spokes
    const axisLines = data.map((_, i) => {
      const angle = angleStep * i - Math.PI / 2;
      return {
        x2: center + radius * Math.cos(angle),
        y2: center + radius * Math.sin(angle)
      };
    });

    // Data polygon
    const dataPoints = data.map((point, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const r = radius * Math.max(0, Math.min(1, point.value));
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle)
      };
    });
    const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

    // Labels positioned outside the chart
    const labelPadding = radius + 22;
    const labels = data.map((point, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const x = center + labelPadding * Math.cos(angle);
      const y = center + labelPadding * Math.sin(angle);

      // Text anchor based on position
      let anchor: "start" | "middle" | "end" = "middle";
      if (Math.cos(angle) < -0.1) anchor = "end";
      else if (Math.cos(angle) > 0.1) anchor = "start";

      return { x, y, anchor, label: point.label, value: point.value };
    });

    return { gridLines, axisLines, dataPolygon, labels, dots: dataPoints };
  }, [data, size, levels, center, radius, angleStep]);

  if (data.length < 3) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <span className="empty-state__icon">◎</span>
        <span className="empty-state__text">Need at least 3 taste signals for the radar chart</span>
      </div>
    );
  }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      style={{ display: "block", margin: "0 auto" }}
    >
      {/* Concentric rings */}
      {gridLines.map(({ points, i }) => (
        <polygon
          key={`grid-${i}`}
          points={points}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
        />
      ))}

      {/* Axis spokes */}
      {axisLines.map((axis, i) => (
        <line
          key={`axis-${i}`}
          x1={center}
          y1={center}
          x2={axis.x2}
          y2={axis.y2}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
      ))}

      {/* Data polygon fill */}
      <polygon
        points={dataPolygon}
        fill="rgba(99,102,241,0.15)"
        stroke="url(#radarGradient)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Data polygon gradient stroke */}
      <defs>
        <linearGradient id="radarGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <radialGradient id="dotGlow">
          <stop offset="0%" stopColor="#818cf8" stopOpacity={0.6} />
          <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Data point dots */}
      {dots.map((dot, i) => (
        <g key={`dot-${i}`}>
          <circle cx={dot.x} cy={dot.y} r={6} fill="url(#dotGlow)" />
          <circle cx={dot.x} cy={dot.y} r={3} fill="#818cf8" stroke="#0f1120" strokeWidth={1} />
        </g>
      ))}

      {/* Axis labels */}
      {labels.map((lbl, i) => (
        <text
          key={`label-${i}`}
          x={lbl.x}
          y={lbl.y}
          textAnchor={lbl.anchor}
          dominantBaseline="central"
          fill={lbl.value > 0.5 ? "#f0f0f5" : "#5c6380"}
          fontSize={10}
          fontFamily="'Inter', system-ui, sans-serif"
          fontWeight={lbl.value > 0.5 ? 600 : 400}
        >
          {lbl.label}
        </text>
      ))}

      {/* Center dot */}
      <circle cx={center} cy={center} r={2} fill="rgba(255,255,255,0.15)" />
    </svg>
  );
}

/**
 * Convert taste graph edges to RadarChart data.
 * Takes top N genres by weight and normalizes to 0–1.
 */
export function tasteEdgesToRadarData(
  edges: Record<string, { node_type: string; node_id: string; weight: number }>,
  nodeType = "genre",
  maxAxes = 8
): RadarPoint[] {
  const entries = Object.values(edges)
    .filter((e) => e.node_type === nodeType && e.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxAxes);

  if (entries.length === 0) return [];

  const maxWeight = Math.max(...entries.map((e) => e.weight));

  return entries.map((entry) => ({
    label: entry.node_id.replace(`${nodeType}:`, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    value: maxWeight > 0 ? entry.weight / maxWeight : 0
  }));
}
