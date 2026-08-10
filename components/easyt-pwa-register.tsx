"use client";

import { useEffect } from "react";

export function EasyTPwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/easyt-sw.js", { scope: "/journey/" });
  }, []);

  return null;
}
