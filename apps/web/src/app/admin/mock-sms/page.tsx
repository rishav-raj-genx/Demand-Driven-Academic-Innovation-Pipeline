"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  MessageSquare,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Phone,
  User,
  ShieldCheck,
  Radio,
  Send,
  Loader2,
  BellRing,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";

interface MockSmsLog {
  id: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  recipientRole: string;
  phoneNumber: string;
  title: string;
  message: string;
  status: string;
  channel: string;
  deliveredAt: string;
  gateway: string;
  createdAt: string;
}

export default function MockSmsViewerPage() {
  const [logs, setLogs] = useState<MockSmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  async function fetchLogs() {
    try {
      const url = searchQuery.trim()
        ? `/api/v1/notifications/mock-sms?limit=50&search=${encodeURIComponent(searchQuery.trim())}`
        : "/api/v1/notifications/mock-sms?limit=50";

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.logs) {
          setLogs(json.data.logs);
        }
      }
    } catch (err) {
      console.error("Failed to load mock SMS logs", err);
    } finally {
      setLoading(false);
      setLastRefreshed(new Date());
    }
  }

  // Initial fetch and auto-refresh timer
  useEffect(() => {
    fetchLogs();

    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, searchQuery]);

  return (
    <AppShell>
      <div className="py-6 space-y-8 max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>BullMQ Background Dispatch Telemetry</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center space-x-2">
              <MessageSquare className="w-6 h-6 text-blue-400" />
              <span>Mock SMS Gateway Live Inspector</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Real-time audit log of citizen intake notifications, duplicate merges, and HEI match assignments dispatched by BullMQ.
            </p>
          </div>

          {/* Action Controls */}
          <div className="flex items-center space-x-3">
            {/* Auto-refresh pill toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border ${
                autoRefresh
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-slate-900 border-slate-800 text-slate-400"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  autoRefresh ? "bg-emerald-400 animate-ping" : "bg-slate-600"
                }`}
              />
              <span>{autoRefresh ? "Auto-Refresh (5s) ON" : "Auto-Refresh OFF"}</span>
            </button>

            {/* Manual refresh button */}
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetchLogs();
              }}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 transition flex items-center space-x-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 font-medium">Delivered SMS Count</div>
            <div className="text-2xl font-black text-white mt-1">{logs.length}</div>
            <div className="text-[10px] text-slate-500">Recent mock dispatches</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-emerald-400 font-medium">Gateway Status</div>
            <div className="text-sm font-black text-emerald-400 mt-1 flex items-center space-x-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>ACTIVE & LOGGED</span>
            </div>
            <div className="text-[10px] text-slate-500">MOCK_SMS_GATEWAY_SIH26043</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-blue-400 font-medium">Channel Protocol</div>
            <div className="text-sm font-black text-blue-400 mt-1">SMS / UTF-8</div>
            <div className="text-[10px] text-slate-500">Tag: [MOCK SMS - SIH26043]</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 font-medium">Last Checked</div>
            <div className="text-xs font-mono text-slate-300 mt-1">
              {lastRefreshed.toLocaleTimeString()}
            </div>
            <div className="text-[10px] text-slate-500">Connected to Postgres</div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by recipient name, phone number, title, or challenge text..."
            className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Loading Indicator */}
        {loading && logs.length === 0 && (
          <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400 mb-2" />
            <p className="text-sm">Fetching mock SMS gateway logs...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && logs.length === 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center">
            <BellRing className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white">No Mock SMS Logs Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Submit a challenge via citizen intake or run the pipeline verification script to generate live SMS dispatch records.
            </p>
          </div>
        )}

        {/* Logs Feed */}
        {logs.length > 0 && (
          <div className="space-y-4">
            {logs.map((log) => {
              // Highlight the [MOCK SMS - SIH26043] prefix
              const prefix = "[MOCK SMS - SIH26043]";
              const hasPrefix = log.message.startsWith(prefix);
              const messageBody = hasPrefix ? log.message.slice(prefix.length).trim() : log.message;

              return (
                <div
                  key={log.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl hover:border-slate-700 transition space-y-3"
                >
                  {/* Top Metadata Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center space-x-1 text-white font-bold">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        <span>{log.recipientName}</span>
                      </span>

                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">
                        {log.recipientRole}
                      </span>

                      <span className="inline-flex items-center space-x-1 font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        <Phone className="w-3 h-3" />
                        <span>{log.phoneNumber}</span>
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 text-slate-400 text-[11px]">
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>DELIVERED_MOCK</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center space-x-1 font-mono">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                      </span>
                    </div>
                  </div>

                  {/* Title & Subject */}
                  <div className="font-bold text-sm text-white">{log.title}</div>

                  {/* SMS Bubble Display */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 leading-relaxed font-sans shadow-inner">
                    {hasPrefix && (
                      <span className="inline-block px-1.5 py-0.5 mr-2 rounded text-[10px] font-mono font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {prefix}
                      </span>
                    )}
                    <span>{messageBody}</span>
                  </div>

                  {/* Footer Telemetry */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                    <span>Log ID: {log.id}</span>
                    <span>Gateway: {log.gateway}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
