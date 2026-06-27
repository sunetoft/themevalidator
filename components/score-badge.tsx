"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getScoreBadgeClass } from "@/lib/scores";

interface ScoreBadgeProps {
  score: number | null;
  label?: string;
  size?: "sm" | "md" | "lg";
}

export default function ScoreBadge({ score, label, size = "md" }: ScoreBadgeProps) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    // Don't animate if score is null
    if (score === null || score === undefined) return;

    const controls = {
      start: displayScore,
      end: score,
      duration: 800,
      startTime: null as number | null,
    };

    const animate = (timestamp: number) => {
      if (!controls.startTime) controls.startTime = timestamp;
      const elapsed = timestamp - controls.startTime;
      const progress = Math.min(elapsed / controls.duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplayScore(Math.round(controls.start + (controls.end - controls.start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };

    const raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  // Show "—" for null scores instead of a misleading "0"
  const isNull = score === null || score === undefined;
  const badgeClass = getScoreBadgeClass(score);

  const sizeClasses = {
    sm: "h-12 w-12 text-xs",
    md: "h-20 w-20 text-lg",
    lg: "h-28 w-28 text-2xl",
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex flex-col items-center gap-1"
    >
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full border-2 border-border",
          badgeClass,
          sizeClasses[size]
        )}
      >
        <span className={cn("font-bold font-mono", isNull ? "text-muted-foreground" : badgeClass.split(" ")[0])}>
          {isNull ? "—" : displayScore}
        </span>
      </div>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </motion.div>
  );
}
