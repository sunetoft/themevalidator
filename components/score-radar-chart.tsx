"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

interface ScoreRadarChartProps {
  scores: {
    sentiment: number;
    ecosystem: number;
    risk: number;
    opportunity: number;
    moat: number;
  };
}

export default function ScoreRadarChart({ scores }: ScoreRadarChartProps) {
  const data = [
    { axis: "Sentiment", value: scores.sentiment },
    { axis: "Ecosystem", value: scores.ecosystem },
    { axis: "Risk", value: scores.risk },
    { axis: "Opportunity", value: scores.opportunity },
    { axis: "Moat", value: scores.moat },
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data}>
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
        />
        <PolarRadiusAxis
          domain={[0, 100]}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
          axisLine={false}
        />
        <Radar
          name="Scores"
          dataKey="value"
          stroke="hsl(var(--primary))"
          fill="hsl(var(--primary))"
          fillOpacity={0.3}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
