"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getPendingCount,
  syncOfflineOutbox,
  type SyncOutboxResult,
} from "@/lib/offline/outbox";
import { WifiOff, Wifi, RefreshCw, CheckCircle2 } from "lucide-react";

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Update pending outbox count
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB not ready or error
    }
  }, []);

  // Perform outbox sync
  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatusMessage("Syncing offline submissions...");

    try {
      const result: SyncOutboxResult = await syncOfflineOutbox();
      await refreshPendingCount();

      if (result.syncedCount > 0) {
        setSyncStatusMessage(`Successfully synced ${result.syncedCount} item(s)!`);
        setTimeout(() => setSyncStatusMessage(null), 4000);
      } else if (result.failedCount > 0) {
        setSyncStatusMessage(`${result.failedCount} item(s) failed to sync. Will retry.`);
        setTimeout(() => setSyncStatusMessage(null), 5000);
      } else {
        setSyncStatusMessage(null);
      }
    } catch (err) {
      console.warn("[PWA] Sync error:", err);
      setSyncStatusMessage("Sync failed. Check connection.");
      setTimeout(() => setSyncStatusMessage(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);
    refreshPendingCount();

    // 1. Register Service Worker
    if ("serviceWorker" in navigator && process.env.NODE_ENV !== "test") {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  console.info("[PWA] New service worker content available.");
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn("[PWA] ServiceWorker registration failed:", err);
        });
    }

    // 2. Browser Online/Offline Event Listeners
    const onOnline = () => {
      setIsOnline(true);
      // Trigger automatic sync on reconnection
      handleSync();
    };

    const onOffline = () => {
      setIsOnline(false);
      refreshPendingCount();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Periodic check for pending outbox items
    const interval = setInterval(refreshPendingCount, 15000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, [handleSync, refreshPendingCount]);

  if (!isMounted) {
    return <>{children}</>;
  }

  const showBanner = !isOnline || pendingCount > 0 || syncStatusMessage !== null;

  return (
    <>
      {showBanner && (
        <aside
          role="status"
          aria-live="polite"
          className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2.5 text-xs sm:text-sm font-medium transition-all shadow-md backdrop-blur-md ${
            !isOnline
              ? "bg-amber-950/90 text-amber-200 border-b border-amber-800/80"
              : syncStatusMessage && syncStatusMessage.includes("Successfully")
              ? "bg-emerald-950/90 text-emerald-200 border-b border-emerald-800/80"
              : "bg-slate-900/90 text-slate-200 border-b border-slate-700/80"
          }`}
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto w-full justify-between">
            <div className="flex items-center gap-2.5">
              {!isOnline ? (
                <>
                  <WifiOff className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                  <span>
                    <strong>Offline Mode:</strong> Submissions are saved locally to your device and will automatically sync when connectivity returns.
                  </span>
                </>
              ) : syncStatusMessage && syncStatusMessage.includes("Successfully") ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{syncStatusMessage}</span>
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    {syncStatusMessage ||
                      `${pendingCount} pending submission${pendingCount === 1 ? "" : "s"} waiting in local outbox.`}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {pendingCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  {pendingCount} queued
                </span>
              )}

              {isOnline && pendingCount > 0 && (
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/60 text-white rounded font-medium text-xs transition focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                  <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
                </button>
              )}
            </div>
          </div>
        </aside>
      )}

      <div className={showBanner ? "pt-10" : ""}>{children}</div>
    </>
  );
}
