"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

export function useOnlineDetector() {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);

      // Only show "back online" toast if we were previously offline
      if (wasOffline) {
        toast.success("🌐 Connection restored", {
          description: "You're back online! Uploads and conversions can continue.",
        });
        setWasOffline(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);

      toast.error("📡 Connection lost", {
        description: "You're offline. Uploads and conversions are paused.",
        duration: 6000, // Show longer for offline notifications
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [isOnline, wasOffline]);

  return {
    isOnline,
    wasOffline,
  };
}
