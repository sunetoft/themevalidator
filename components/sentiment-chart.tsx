"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Tweet {
  id: string;
  text: string;
  authorName?: string;
  authorUsername?: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  createdAt: string;
}

interface SentimentChartProps {
  tweets: Tweet[];
}

export default function SentimentChart({ tweets }: SentimentChartProps) {
  if (!tweets || tweets.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No tweets found for this analysis.
      </div>
    );
  }

  const data = tweets.slice(0, 10).map((t, i) => ({
    name: t.authorUsername || `@user${i + 1}`,
    engagement: t.likeCount + t.retweetCount,
    likes: t.likeCount,
    retweets: t.retweetCount,
    text: t.text.slice(0, 80) + "...",
  }));

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
          <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            width={100}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value: any, name: any, props: any) => [
              `${value} (${props.payload.likes} likes, ${props.payload.retweets} RTs)`,
              "Engagement",
            ]}
            labelFormatter={(label: any) => `@${label}`}
          />
          <Bar dataKey="engagement" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={i < 3 ? "hsl(var(--primary))" : "hsl(var(--chart-2))"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {tweets.slice(0, 10).map((t, i) => (
          <div key={t.id} className="rounded-lg border border-border/40 p-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">@{t.authorUsername || "unknown"}</span>
              <span className="flex gap-3 text-xs text-muted-foreground">
                <span>❤️ {t.likeCount}</span>
                <span>🔁 {t.retweetCount}</span>
              </span>
            </div>
            <p className="text-muted-foreground line-clamp-2">{t.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
