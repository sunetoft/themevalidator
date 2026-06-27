"use client";

import { useEffect } from "react";

export default function ChunkLoadErrorHandler() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (
        event.message?.includes("Loading chunk") ||
        event.message?.includes("Loading CSS chunk")
      ) {
        console.warn("Chunk load failed, reloading...");
        window.location.reload();
      }
    };

    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, []);

  return null;
}
