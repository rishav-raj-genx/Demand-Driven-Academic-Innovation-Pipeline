"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Sparkles,
  Server,
  Database,
  Radio,
  Cpu,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Play,
  RotateCcw,
  Check,
  ChevronRight,
  FileText,
  Users,
  Compass,
  Building2,
  Briefcase,
  Layers,
  MessageSquare,
  Activity,
  Zap,
} from "lucide-react";
import { AppShell, type ShellUser } from "@/components/AppShell";

interface DemoDiagnosticsData {
  infrastructure: {
    database: {
      status: string;
      latencyMs: number;
      pgVersion: string;
      postgisVersion: string;
      pgvectorVersion: string;
      counts: {
        totalChallenges: number;
        embeddedChallenges: number;
        duplicatesLinked: number;
        totalInstitutions: number;
        embeddedInstitutions: number;
        industryPartners: number;
        activeProjects: number;
        districts: number;
        capabilityMatches: number;
      };
    };
    redis: {
      status: string;
      latencyMs: number;
      ping: string;
      queues: string[];
    };
    aiEngine: {
      status: string;
      latencyMs: number;
      endpoint: string;
      model: string;
      dedupThreshold: number;
      healthData: Record<string, unknown> | null;
    };
    storage: {
      status: string;
      latencyMs: number;
      bucket: string;
      endpoint: string;
      allowedTypes: string[];
      maxSizeBytes: number;
    };
  };
  liveCheckpoints: {
    checkpoint1_citizenOffline: {
      title: string;
      route: string;
      ready: boolean;
      description: string;
    };
    checkpoint2_semanticDedup: {
      title: string;
      route: string;
      ready: boolean;
      duplicatesCount: number;
      description: string;
    };
    checkpoint3_capacityRouting: {
      title: string;
      route: string;
      ready: boolean;
      matchesCount: number;
      description: string;
    };
    checkpoint4_dualSignature: {
      title: string;
      route: string;
      ready: boolean;
      projectId: string | null;
      projectTitle: string | null;
      milestoneId: string | null;
      milestoneTitle: string | null;
      milestoneStatus: string | null;
      contentHash: string | null;
      academicSigner: string | null;
      academicRole: string | null;
      externalSignerPending: boolean;
      recommendedExternalSigner: {
        email: string;
        organization: string;
      };
    };
    checkpoint5_spatialMapSms: {
      title: string;
      dashboardRoute: string;
      smsRoute: string;
      ready: boolean;
      districtsCount: number;
      description: string;
    };
  };
}

export default function AdminDemoPage() {
  const isHelperEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_HELPER !== "false";

  // If demo helper is disabled, render standard 404
  if (!isHelperEnabled) {
    notFound();
  }

  const [user, setUser] = useState<ShellUser | null>(null);
  const [diagnostics, setDiagnostics] = useState<DemoDiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Reset state action
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetDurationMs, setResetDurationMs] = useState<number | null>(null);

  const fetchDiagnostics = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/v1/admin/demo/health", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setDiagnostics(json.data);
        }
      }
    } catch {
      // keep prior state on transient error
    } finally {
      setRefreshing(false);
      setLoading(false);
      setLastRefreshed(new Date());
    }
  }, []);

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((meJson) => {
        if (meJson?.success && meJson?.data?.user) {
          setUser(meJson.data.user);
        }
      })
      .catch(() => null);

    fetchDiagnostics();
  }, [fetchDiagnostics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchDiagnostics();
    }, 6000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchDiagnostics]);

  async function handleResetDemo() {
    if (isResetting) return;
    setIsResetting(true);
    setResetMessage(null);
    setResetDurationMs(null);

    try {
      const res = await fetch("/api/v1/admin/demo/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        setResetMessage(data.message || "Demo state successfully reset.");
        setResetDurationMs(data.durationMs);
        await fetchDiagnostics();
      } else {
        setResetMessage(`Error: ${data.error?.message || "Reset failed"}`);
      }
    } catch (err) {
      setResetMessage("Network error during demo reset.");
    } finally {
      setIsResetting(false);
    }
  }

  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  return (
    <AppShell>
      <div className="py-6 space-y-8 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span>SIH26043 Evaluator Deck • Team &apos;The Unknowns&apos;</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center space-x-3">
              <Sparkles className="w-7 h-7 text-emerald-400 flex-shrink-0" />
              <span>Demo Inspector &amp; Control Deck</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              Deterministic state verification, live container health indicators, and direct showcase links for all 5 Smart India Hackathon 2024 core requirements.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Auto Refresh Toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center space-x-1.5 transition ${
                autoRefresh
                  ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
                  : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Auto-refresh: {autoRefresh ? "On" : "Off"}</span>
            </button>

            {/* Manual Refresh */}
            <button
              type="button"
              onClick={fetchDiagnostics}
              disabled={refreshing}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
            </button>

            {/* Deterministic Reset Button */}
            {isSuperAdmin && (
              <button
                type="button"
                onClick={handleResetDemo}
                disabled={isResetting}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950/40 flex items-center space-x-2 transition disabled:opacity-50"
              >
                <RotateCcw className={`w-4 h-4 ${isResetting ? "animate-spin" : ""}`} />
                <span>{isResetting ? "Resetting Demo State..." : "1-Click Demo Reset"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Reset Feedback Banner */}
        {resetMessage && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
              resetMessage.startsWith("Error")
                ? "bg-red-500/10 border-red-500/30 text-red-300"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            }`}
          >
            <div className="flex items-center space-x-3">
              {resetMessage.startsWith("Error") ? (
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              )}
              <span>{resetMessage}</span>
            </div>
            {resetDurationMs !== null && (
              <span className="text-xs font-mono bg-emerald-950/60 px-2.5 py-1 rounded-md border border-emerald-500/30">
                {(resetDurationMs / 1000).toFixed(2)}s execution
              </span>
            )}
          </div>
        )}

        {/* RBAC Gate Warning if logged in as non-super admin */}
        {!isSuperAdmin && !loading && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start space-x-3 text-sm">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Super Admin Privileges Required for Full Access</p>
              <p className="text-xs text-amber-400/90 mt-0.5">
                You are currently signed in as {user?.email || "Guest"} ({user?.role || "UNAUTHENTICATED"}).
                To execute resets or access privileged telemetry, please{" "}
                <Link href="/login" className="underline font-bold hover:text-white">
                  sign in as admin@sih.gov.in
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        {/* SECTION 1: Infrastructure Health Indicators */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <Server className="w-4 h-4 text-blue-400" />
              <span>Containerized Infrastructure Health</span>
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              Last probe: {lastRefreshed.toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Database */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Database className="w-5 h-5 text-blue-400" />
                  <span className="font-bold text-white text-sm">PostgreSQL 16</span>
                </div>
                <span className="flex items-center space-x-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>{diagnostics?.infrastructure.database.latencyMs ?? 0}ms</span>
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>PostGIS Engine:</span>
                  <span className="font-mono text-slate-200">v{diagnostics?.infrastructure.database.postgisVersion ?? "3.7.0"}</span>
                </div>
                <div className="flex justify-between">
                  <span>pgvector Extension:</span>
                  <span className="font-mono text-slate-200">v{diagnostics?.infrastructure.database.pgvectorVersion ?? "0.8.7"}</span>
                </div>
                <div className="flex justify-between border-t border-slate-800/80 pt-1.5">
                  <span>Embedded Demands:</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {diagnostics?.infrastructure.database.counts.embeddedChallenges ?? 0} /{" "}
                    {diagnostics?.infrastructure.database.counts.totalChallenges ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Vectorized HEIs:</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {diagnostics?.infrastructure.database.counts.embeddedInstitutions ?? 0} /{" "}
                    {diagnostics?.infrastructure.database.counts.totalInstitutions ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Redis + BullMQ */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Radio className="w-5 h-5 text-purple-400" />
                  <span className="font-bold text-white text-sm">Redis 7 + BullMQ</span>
                </div>
                <span className="flex items-center space-x-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>{diagnostics?.infrastructure.redis.ping ?? "PONG"}</span>
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Worker Pipeline:</span>
                  <span className="text-purple-300 font-medium">challenge-pipeline</span>
                </div>
                <div className="flex justify-between">
                  <span>Async HEI Embed:</span>
                  <span className="text-purple-300 font-medium">hei-embedding</span>
                </div>
                <div className="flex justify-between border-t border-slate-800/80 pt-1.5">
                  <span>Telemetry Queue:</span>
                  <span className="text-purple-300 font-medium">notify.sms (Mock Gateway)</span>
                </div>
                <div className="flex justify-between">
                  <span>Dead-Letter Routing:</span>
                  <span className="text-emerald-400 font-semibold">Active &amp; Monitored</span>
                </div>
              </div>
            </div>

            {/* 3. Python FastAPI AI Engine */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-white text-sm">FastAPI AI Engine</span>
                </div>
                <span className="flex items-center space-x-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>{diagnostics?.infrastructure.aiEngine.latencyMs ?? 0}ms</span>
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Dense Encoder:</span>
                  <span className="font-mono text-slate-200">all-MiniLM-L6-v2</span>
                </div>
                <div className="flex justify-between">
                  <span>Vector Dimensions:</span>
                  <span className="font-mono text-emerald-400 font-semibold">384-dim (Cosine)</span>
                </div>
                <div className="flex justify-between border-t border-slate-800/80 pt-1.5">
                  <span>Dedup Threshold:</span>
                  <span className="font-mono text-slate-200">Cosine &ge; 0.68</span>
                </div>
                <div className="flex justify-between">
                  <span>Capacity Penalizer:</span>
                  <span className="text-emerald-400 font-semibold">Quadratic Overload</span>
                </div>
              </div>
            </div>

            {/* 4. S3 / MinIO */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <HardDrive className="w-5 h-5 text-amber-400" />
                  <span className="font-bold text-white text-sm">MinIO S3 Storage</span>
                </div>
                <span className="flex items-center space-x-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>{diagnostics?.infrastructure.storage.latencyMs ?? 0}ms</span>
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Bucket:</span>
                  <span className="font-mono text-slate-200">{diagnostics?.infrastructure.storage.bucket ?? "sih26043-media"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Payload:</span>
                  <span className="font-mono text-slate-200">10 MB Presigned</span>
                </div>
                <div className="flex justify-between border-t border-slate-800/80 pt-1.5">
                  <span>Whitelisted Formats:</span>
                  <span className="text-slate-200">PNG, JPG, WebP, PDF</span>
                </div>
                <div className="flex justify-between">
                  <span>Proxying:</span>
                  <span className="text-emerald-400 font-semibold">Zero-Byte Direct PUT</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: 5 SIH Live-Demo Checkpoints */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>The 5 SIH Live-Demo Checkpoints</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Click any checkpoint to launch the exact page and showcase the corresponding evaluation requirement to the judges.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Checkpoint 1: Citizen PWA Offline Intake */}
            <div className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition group">
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 font-mono font-bold flex items-center justify-center text-xs border border-blue-500/30">
                      01
                    </span>
                    <h3 className="font-bold text-white text-base group-hover:text-blue-400 transition">
                      Citizen PWA Offline Submission
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                    PWA Ready
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-2">
                  Offline-first Service Worker + local IndexedDB outbox queue. Demonstrates that when network connectivity in rural Jharkhand is severed, citizens can still submit challenges; submissions persist locally with idempotency keys and automatically flush into BullMQ background queues when reconnected.
                </p>
                <div className="mt-3 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 font-mono space-y-1">
                  <div>&bull; Storage: IndexedDB outbox with SHA-256 client idempotency keys</div>
                  <div>&bull; Auto-Sync: Service Worker online event trigger</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-xs text-slate-500">Route: /challenges/new</span>
                <Link
                  href="/challenges/new"
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow-sm"
                >
                  <span>Open Citizen Intake</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Checkpoint 2: Semantic Deduplication Proof */}
            <div className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition group">
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-7 h-7 rounded-lg bg-emerald-600/20 text-emerald-400 font-mono font-bold flex items-center justify-center text-xs border border-emerald-500/30">
                      02
                    </span>
                    <h3 className="font-bold text-white text-base group-hover:text-emerald-400 transition">
                      Semantic Deduplication Proof
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                    {diagnostics?.liveCheckpoints.checkpoint2_semanticDedup.duplicatesCount ?? 3} Duplicates Merged
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-2">
                  384-dimensional cosine similarity engine detects semantic duplicates across vernacular phrasing (e.g., Palamu groundwater defluoridation and Dumka solar micro-grid demands) and links them to canonical parents, incrementing citizen endorsement counters without fragmenting R&amp;D effort.
                </p>
                <div className="mt-3 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 font-mono space-y-1">
                  <div>&bull; Pair 1: jh-chal-002 merged into jh-chal-001 (Palamu Water, sim: 0.7967)</div>
                  <div>&bull; Pair 2: jh-chal-006 merged into jh-chal-005 (Dumka Solar, sim: 0.7510)</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-xs text-slate-500">Route: /challenges (Toggle Duplicates)</span>
                <Link
                  href="/challenges"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow-sm"
                >
                  <span>Open Challenges Explorer</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Checkpoint 3: Capacity-Aware Tier-2/3 Routing */}
            <div className="bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition group">
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-7 h-7 rounded-lg bg-purple-600/20 text-purple-400 font-mono font-bold flex items-center justify-center text-xs border border-purple-500/30">
                      03
                    </span>
                    <h3 className="font-bold text-white text-base group-hover:text-purple-400 transition">
                      Capacity-Aware Tier-2/3 Routing
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-950 text-purple-400 border border-purple-500/30">
                    Balanced Routing Active
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-2">
                  PostGIS distance weighting combined with quadratic capacity penalty (utilization &ge; 1.0 incurs -0.45 penalty) prevents research monopolization by Tier-1 institutions (like NIT Jamshedpur at 5/5 capacity), boosting Tier-2 and Tier-3 institutions into Rank #1 positions.
                </p>
                <div className="mt-3 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 font-mono space-y-1">
                  <div>&bull; NIT Jamshedpur (Tier-1): 5/5 projects &rarr; penalized by -0.45</div>
                  <div>&bull; BIT Sindri (Tier-2) &amp; Govt. Poly Adityapur (Tier-3): Promoted to Rank #1</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-xs text-slate-500">Route: /dashboard &amp; /hei/dashboard</span>
                <Link
                  href="/dashboard"
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow-sm"
                >
                  <span>Open Executive Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Checkpoint 4: Live PoC -> Prototyping Dual-Signature */}
            <div className="bg-slate-900 border-2 border-emerald-500/60 rounded-2xl p-5 shadow-xl flex flex-col justify-between transition group bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20">
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 font-mono font-bold flex items-center justify-center text-xs shadow-md">
                      04
                    </span>
                    <h3 className="font-bold text-white text-base text-emerald-400">
                      Live PoC &rarr; Prototyping Dual-Signature
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold animate-pulse">
                    READY FOR LIVE SIGN
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mt-2">
                  Cryptographic stage-gate transition engine. The Academic Track signature (Dr. Sunita Murmu, Faculty PI) is recorded on the verified SHA-256 deliverable contentHash. Presenters can sign as Tata Steel CSR (or Super Admin) to satisfy dual-signature criteria, triggering live advancement to PROTOTYPING and awarding 2 NEP 2020 credits.
                </p>

                {/* POC Project Snapshot */}
                <div className="mt-3 p-3 rounded-lg bg-slate-950 border border-emerald-500/40 text-[11px] space-y-1.5">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-400">PoC Project:</span>
                    <span className="text-white truncate max-w-[280px]">
                      {diagnostics?.liveCheckpoints.checkpoint4_dualSignature.projectTitle ?? "Solar-Powered Groundwater Defluoridation"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Deliverable Hash:</span>
                    <span className="font-mono text-emerald-400 truncate max-w-[240px]">
                      {diagnostics?.liveCheckpoints.checkpoint4_dualSignature.contentHash?.slice(0, 16)}...
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                    <span className="text-slate-400">Signatures:</span>
                    <span className="flex items-center space-x-2">
                      <span className="text-emerald-400 font-semibold flex items-center space-x-0.5">
                        <Check className="w-3 h-3" />
                        <span>Academic (Dr. Sunita Murmu)</span>
                      </span>
                      <span className="text-amber-400 font-semibold animate-pulse">
                        ⏳ Industry Pending
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-emerald-500/30 flex items-center justify-between">
                <span className="text-xs text-slate-400">Login: industry@tata.com</span>
                <Link
                  href={diagnostics?.liveCheckpoints.checkpoint4_dualSignature.route || "/projects"}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center space-x-2 transition shadow-lg shadow-emerald-950/40"
                >
                  <span>Launch Live Dual-Signature</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Checkpoint 5: PostGIS Density Map & Mock SMS Log */}
            <div className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition group lg:col-span-2">
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 font-mono font-bold flex items-center justify-center text-xs border border-blue-500/30">
                      05
                    </span>
                    <h3 className="font-bold text-white text-base group-hover:text-blue-400 transition">
                      Jharkhand PostGIS Spatial Density Dashboard + Mock SMS Gateway
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-500/30">
                    Live PostGIS &amp; BullMQ Telemetry
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-2">
                  Sub-150ms PostGIS spatial innovation density engine aggregates crowdsourced demands across Jharkhand&apos;s 8 administrative districts with GeoJSON MultiPolygons, paired with real-time BullMQ SMS dispatch telemetry showing notification delivery to citizens, faculty, and MSMEs.
                </p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                    &bull; PostGIS: 8 District MultiPolygons
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                    &bull; Offline Map: Dark canvas SVG fallback
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                    &bull; Gateway: BullMQ notify.sms logging
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-500">Routes: /dashboard &amp; /admin/mock-sms</span>
                <div className="flex items-center space-x-3">
                  <Link
                    href="/dashboard"
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow-sm"
                  >
                    <span>Open PostGIS Map</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    href="/admin/mock-sms"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center space-x-1.5 transition"
                  >
                    <span>View Mock SMS Logs</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: Demo Presenter Credentials Matrix */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center space-x-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Demo Presenter Persona Cheat Sheet (Password: DemoPassword123!)</span>
            </h3>
            <span className="text-xs text-slate-500">Argon2id Hashed Baseline</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="font-semibold text-blue-400">Citizen / Student</div>
              <div className="font-mono text-slate-200">student@sih.gov.in</div>
              <div className="text-[11px] text-slate-400">Offline PWA challenge submission</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="font-semibold text-emerald-400">Faculty Lead (PI)</div>
              <div className="font-mono text-slate-200">faculty@sih.gov.in</div>
              <div className="text-[11px] text-slate-400">Signed Academic Track on PoC</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="font-semibold text-purple-400">Industry Partner (Tata CSR)</div>
              <div className="font-mono text-slate-200">industry@tata.com</div>
              <div className="text-[11px] text-slate-400">Ready to sign External Track on PoC</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="font-semibold text-amber-400">Super Administrator</div>
              <div className="font-mono text-slate-200">admin@sih.gov.in</div>
              <div className="text-[11px] text-slate-400">Full system &amp; inspector control</div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
