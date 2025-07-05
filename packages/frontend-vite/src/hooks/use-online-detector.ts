import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

export function useOnlineDetector() {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const lastCheckTimeRef = useRef(0);

  const testConnectivity = useCallback(async (): Promise<boolean> => {
    try {
      const endpoints = [
        `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/health`,
        "https://www.google.com/favicon.ico",
        "https://httpbin.org/status/200",
      ];

      for (const endpoint of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

          await fetch(endpoint, {
            method: "HEAD",
            mode: "no-cors",
            cache: "no-cache",
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          return true;
        } catch {
          continue;
        }
      }

      return false;
    } catch {
      return false;
    }
  }, []);

  const checkConnectivity = useCallback(
    async (force: boolean = false) => {
      const now = Date.now();

      // Debounce: Don't check more than once every 10 seconds unless forced
      if (!force && now - lastCheckTimeRef.current < 10000) {
        console.log("🔄 Skipping connectivity check (debounced)");
        return;
      }

      lastCheckTimeRef.current = now;
      console.log("🌐 Checking connectivity...");

      const hasConnectivity = await testConnectivity();

      if (hasConnectivity !== isOnline) {
        setIsOnline(hasConnectivity);

        if (hasConnectivity && wasOffline) {
          toast.success("🌐 Connection restored", {
            description:
              "You're back online! Uploads and conversions can continue.",
          });
          setWasOffline(false);
        } else if (!hasConnectivity && !wasOffline) {
          setWasOffline(true);
          toast.error("📡 Connection lost", {
            description: "You're offline. Uploads and conversions are paused.",
            duration: 6000,
          });
        }
      }
    },
    [isOnline, wasOffline, testConnectivity]
  );

  useEffect(() => {
    checkConnectivity(true); // Force initial check

    // Reduced frequency: Check every 60 seconds instead of 30
    const intervalId = setInterval(() => checkConnectivity(true), 60000);

    const handleOnline = () => {
      setTimeout(() => checkConnectivity(true), 1000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (!wasOffline) {
        setWasOffline(true);
        toast.error("📡 Connection lost", {
          description: "You're offline. Uploads and conversions are paused.",
          duration: 6000,
        });
      }
    };

    const handleFocus = () => {
      // Don't force focus checks - let debouncing handle it
      checkConnectivity(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
    };
  }, [checkConnectivity, wasOffline]);

  return {
    isOnline,
    wasOffline,
    checkConnectivity,
  };
}
