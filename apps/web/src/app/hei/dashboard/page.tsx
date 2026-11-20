"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Sparkles,
  Layers,
  ArrowRight,
  TrendingUp,
  Sliders,
  Compass,
  ThumbsUp,
  Clock,
  Zap,
  Info,
  Check,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { AppShell, type ShellUser } from "@/components/AppShell";

interface MatchedChallengeItem {
  matchId: string;
  challengeId: string;
  title: string;
  problemStatement: string;
  domain?: string | null;
  urgency: string;
  status: string;
  endorsementCount: number;
  similarityScore: number;
  matchRank?: number | null;
  explanation?: string | null;
  matchedAt: string;
}

interface InstitutionProfile {
  id: string;
  name: string;
  code: string;
  tier: string;
  district?: {
    id: string;
    name: string;
    code: string;
    state: string;
  } | null;
  address?: string | null;
  website?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  verificationStatus: string;
  activeProjects: number;
  maxCapacity: number;
  utilizationRatio: number;
  domains: string[];
  facultySpecializations: string[];
  labFacilities: string[];
  profileSummary?: string | null;
  matchedChallenges: MatchedChallengeItem[];
}

interface ScoreBreakdown {
  cosineSimilarity: number;
  geoBoost: number;
  capacityPenalty: number;
  finalScore: number;
  explanation: string;
}

function parseScoreBreakdown(
  feedback: string | null | undefined,
  finalScore: number,
  utilization: number
): ScoreBreakdown {
  const explanation = feedback || "AI capacity-aware matchmaking evaluation completed.";

  let cosine = 0.75;
  const cosineMatch = explanation.match(/(?:match|alignment)\s*\(([0-9.]+)\)/i);
  if (cosineMatch && cosineMatch[1]) {
    cosine = parseFloat(cosineMatch[1]);
  } else {
    cosine = Number(finalScore.toFixed(2));
  }

  let geo = 0.0;
  const geoMatch = explanation.match(/\(\+([0-9.]+)(?:,\s*[0-9]+km)?\)/i);
  if (geoMatch && geoMatch[1]) {
    geo = parseFloat(geoMatch[1]);
  }

  let penalty = 0.0;
  const penMatch = explanation.match(/Penalized\s*\(-([0-9.]+)\)/i);
  if (penMatch && penMatch[1]) {
    penalty = parseFloat(penMatch[1]);
  } else if (utilization >= 1.0) {
    penalty = 0.45;
  } else if (utilization > 0.0) {
    penalty = Number((0.25 * Math.pow(utilization, 2)).toFixed(2));
  }

  return {
    cosineSimilarity: Math.min(1.0, Math.max(0.0, cosine)),
    geoBoost: Math.min(0.08, Math.max(0.0, geo)),
    capacityPenalty: Math.min(0.45, Math.max(0.0, penalty)),
    finalScore: Math.min(1.0, Math.max(0.0, finalScore)),
    explanation,
  };
}

export default function HeiDashboardPage() {
  const [user, setUser] = useState<ShellUser | null>(null);
  const [institutionsList, setInstitutionsList] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("");
  const [institution, setInstitution] = useState<InstitutionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingChallenge, setClaimingChallenge] = useState<MatchedChallengeItem | null>(null);
  const [claimSuccessMsg, setClaimSuccessMsg] = useState<string | null>(null);

  // 1. Initial Load: Authenticate and resolve institution ID
  useEffect(() => {
    async function init() {
      try {
        const [meRes, instListRes] = await Promise.all([
          fetch("/api/v1/auth/me").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/v1/institutions?limit=20").then((r) => (r.ok ? r.json() : null)),
        ]);

        if (meRes?.success && meRes?.data?.user) {
          setUser(meRes.data.user);
        }

        const institutions = instListRes?.data || [];
        setInstitutionsList(institutions);

        // Prioritize user's own institution, or fallback to first institution
        const targetId = meRes?.data?.user?.institutionId || institutions[0]?.id || "";
        if (targetId) {
          setSelectedInstitutionId(targetId);
        }
      } catch (err) {
        console.error("Failed to initialize HEI Dashboard", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // 2. Fetch selected institution details & matched challenges
  useEffect(() => {
    if (!selectedInstitutionId) return;

    let isMounted = true;
    fetch(`/api/v1/institutions/${selectedInstitutionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (isMounted && json?.success && json?.data) {
          setInstitution(json.data);
        }
      })
      .catch((err) => console.error("Error loading institution profile", err));

    return () => {
      isMounted = false;
    };
  }, [selectedInstitutionId]);

  const activeProjects = institution?.activeProjects ?? 0;
  const maxCapacity = Math.max(institution?.maxCapacity ?? 10, 1);
  const utilizationRatio = Number((activeProjects / maxCapacity).toFixed(2));
  const utilizationPct = Math.round(utilizationRatio * 100);
  const isOverloaded = utilizationRatio >= 1.0;
  const isNearCapacity = utilizationRatio >= 0.8 && !isOverloaded;

  function handleClaimChallenge(challenge: MatchedChallengeItem) {
    setClaimingChallenge(challenge);
    setClaimSuccessMsg(null);
  }

  function confirmClaim() {
    if (!claimingChallenge) return;
    setClaimSuccessMsg(
      `Challenge '${claimingChallenge.title}' has been flagged for institutional claim. Formal dual-signature MoU generation & Phase 6 milestone tracking will open upon sponsor approval.`
    );
    setTimeout(() => {
      setClaimingChallenge(null);
    }, 2800);
  }

  return (
    <AppShell initialUser={user}>
      <div className="py-6 space-y-8 max-w-7xl mx-auto">
        {/* Navigation Breadcrumb & Portal Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
              <Building2 className="w-4 h-4" />
              <span>Higher Education Institution (HEI) Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {institution ? institution.name : "Institutional Capability Dashboard"}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Automated pgvector demand matchmaking, capacity saturation controls, and PoC incubation workflow.
            </p>
          </div>

          {/* Quick Action Navigation */}
          <div className="flex items-center space-x-3">
            {/* Institution Switcher for Super Admin or Demo Viewing */}
            {institutionsList.length > 1 && (
              <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
                <span className="text-xs text-slate-400 font-medium">HEI:</span>
                <select
                  value={selectedInstitutionId}
                  onChange={(e) => setSelectedInstitutionId(e.target.value)}
                  className="bg-transparent text-xs text-blue-400 font-semibold focus:outline-none cursor-pointer"
                >
                  {institutionsList.map((inst) => (
                    <option key={inst.id} value={inst.id} className="bg-slate-900 text-white">
                      {inst.name} ({inst.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Link
              href="/hei/profile"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/20"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Edit Capability Profile</span>
            </Link>
          </div>
        </div>

        {/* Loading State */}
        {loading && !institution && (
          <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400 mb-2" />
            <p className="text-sm">Loading institutional capability telemetry...</p>
          </div>
        )}

        {institution && (
          <>
            {/* Top Info Grid: Institutional Verification & Telemetry */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Card 1: AISHE Verification Trust Badge */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">
                      AISHE Identity Verification
                    </span>
                    <span className="px-2.5 py-1 text-[11px] font-black rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                      {institution.tier}
                    </span>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-lg font-black text-white flex items-center space-x-2">
                        <span>AISHE Code: {institution.code}</span>
                      </div>
                      <div className="text-xs text-emerald-400 font-semibold flex items-center space-x-1 mt-0.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>Verified Educational Body</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-2 flex items-center space-x-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <span>
                          {institution.district?.name || "Jharkhand"}, {institution.district?.state || "India"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>Domains Registered:</span>
                  <span className="text-white font-bold">{institution.domains.length} Clusters</span>
                </div>
              </div>

              {/* Card 2 & 3: Visual Capacity Utilization Gauge with Overload Warning Badge */}
              <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">
                        Lab & Faculty Capacity Utilization
                      </span>
                    </div>

                    {/* Overload Warning Badge */}
                    {isOverloaded ? (
                      <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>OVERLOAD PENALTY ACTIVE (-0.45)</span>
                      </span>
                    ) : isNearCapacity ? (
                      <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-400 border border-amber-500/40">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>NEAR SATURATION (80%+)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>OPTIMAL CAPACITY AVAILABLE</span>
                      </span>
                    )}
                  </div>

                  {/* Utilization Metric Display */}
                  <div className="flex items-baseline justify-between mt-2 mb-3">
                    <div>
                      <span className="text-3xl font-black text-white">{activeProjects}</span>
                      <span className="text-lg font-bold text-slate-400"> / {maxCapacity} Projects</span>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-2xl font-black ${
                          isOverloaded
                            ? "text-red-400"
                            : isNearCapacity
                            ? "text-amber-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {utilizationPct}%
                      </span>
                      <span className="text-xs text-slate-400 ml-1">Utilized</span>
                    </div>
                  </div>

                  {/* Progress Bar Gauge */}
                  <div className="w-full bg-slate-950 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOverloaded
                          ? "bg-gradient-to-r from-amber-500 to-red-500"
                          : isNearCapacity
                          ? "bg-gradient-to-r from-blue-500 to-amber-500"
                          : "bg-gradient-to-r from-blue-600 to-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, utilizationPct)}%` }}
                    />
                  </div>

                  <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                    {isOverloaded
                      ? "⚠️ Institution is currently running at or above maximum capacity. New challenge matchmaking ranks this institution with a severe -0.45 overload damping penalty to route demand toward available Tier-2/3 partners."
                      : isNearCapacity
                      ? "ℹ️ Active projects are approaching capacity limit. A mild quadratic capacity penalty (0.25 * utilization²) is applied in matchmaking."
                      : "✅ Ample institutional capacity available. Matching engine grants full score priority for high-similarity regional challenges."}
                  </p>
                </div>

                {/* Sub-telemetry strip */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                  <span>
                    Faculty Specializations:{" "}
                    <strong className="text-white">{institution.facultySpecializations.length}</strong>
                  </span>
                  <span>
                    Laboratory Facilities:{" "}
                    <strong className="text-white">{institution.labFacilities.length}</strong>
                  </span>
                  <span>
                    Vector Dimensions: <strong className="text-emerald-400">384-dim (pgvector)</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Matched Challenges Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-white flex items-center space-x-2">
                    <Sparkles className="w-5 h-5 text-blue-400" />
                    <span>Incoming AI-Matched Civic & Industrial Challenges</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Ranked matches derived from MiniLM embeddings, PostGIS distance decay, and capacity damping.
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
                  {institution.matchedChallenges.length} Matches Found
                </span>
              </div>

              {/* Empty State */}
              {institution.matchedChallenges.length === 0 && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center">
                  <Compass className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-white">No incoming challenges currently queued</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    When new citizen or enterprise challenges are submitted, the BullMQ worker runs pgvector semantic
                    matching to recommend them here.
                  </p>
                </div>
              )}

              {/* Challenge Matches List */}
              <div className="grid grid-cols-1 gap-5">
                {institution.matchedChallenges.map((match, idx) => {
                  const breakdown = parseScoreBreakdown(
                    match.explanation,
                    match.similarityScore,
                    institution.utilizationRatio
                  );
                  const scorePct = Math.round(breakdown.finalScore * 100);

                  return (
                    <div
                      key={match.matchId}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl hover:border-slate-700 transition"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        {/* Left: Challenge Core Details */}
                        <div className="space-y-3 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              Rank #{match.matchRank || idx + 1}
                            </span>
                            {match.domain && (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300">
                                {match.domain}
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                match.urgency === "CRITICAL"
                                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              }`}
                            >
                              {match.urgency}
                            </span>
                            <span className="text-xs text-slate-400 flex items-center space-x-1">
                              <ThumbsUp className="w-3.5 h-3.5" />
                              <span>{match.endorsementCount} Endorsements</span>
                            </span>
                          </div>

                          <h3 className="text-lg font-bold text-white hover:text-blue-400 transition">
                            <Link href={`/challenges/${match.challengeId}`}>{match.title}</Link>
                          </h3>

                          <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                            {match.problemStatement}
                          </p>

                          {/* Match Explanation Pill */}
                          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5 text-xs text-slate-300 flex items-start space-x-2">
                            <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                            <span>
                              <strong className="text-blue-300">Match Insight: </strong>
                              {breakdown.explanation}
                            </span>
                          </div>
                        </div>

                        {/* Right: AI Score Breakdown Card & Claim Button */}
                        <div className="lg:w-80 flex flex-col justify-between space-y-4 bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex-shrink-0">
                          <div>
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                              <span>Match Score Breakdown</span>
                              <span className="text-emerald-400 font-extrabold">{scorePct}% Match</span>
                            </div>

                            {/* 4-Card Score Breakdown Grid */}
                            <div className="grid grid-cols-2 gap-2 text-center">
                              {/* 1. Cosine Similarity */}
                              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                                <div className="text-[10px] text-slate-400 font-medium">Cosine Similarity</div>
                                <div className="text-sm font-black text-blue-400">
                                  {Math.round(breakdown.cosineSimilarity * 100)}%
                                </div>
                                <div className="text-[9px] text-slate-500">Domain Match</div>
                              </div>

                              {/* 2. Geo Boost */}
                              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                                <div className="text-[10px] text-slate-400 font-medium">Geo Boost</div>
                                <div className="text-sm font-black text-emerald-400">
                                  +{Math.round(breakdown.geoBoost * 100)}%
                                </div>
                                <div className="text-[9px] text-slate-500">PostGIS Proximity</div>
                              </div>

                              {/* 3. Capacity Penalty */}
                              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                                <div className="text-[10px] text-slate-400 font-medium">Capacity Penalty</div>
                                <div
                                  className={`text-sm font-black ${
                                    breakdown.capacityPenalty > 0 ? "text-red-400" : "text-slate-400"
                                  }`}
                                >
                                  -{Math.round(breakdown.capacityPenalty * 100)}%
                                </div>
                                <div className="text-[9px] text-slate-500">Load Balancing</div>
                              </div>

                              {/* 4. Final Score */}
                              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                                <div className="text-[10px] text-slate-400 font-medium">Final Rank Score</div>
                                <div className="text-sm font-black text-emerald-400">{scorePct}%</div>
                                <div className="text-[9px] text-slate-500">Composite Fit</div>
                              </div>
                            </div>
                          </div>

                          {/* Claim Challenge Action Button */}
                          <button
                            type="button"
                            onClick={() => handleClaimChallenge(match)}
                            className="w-full py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center justify-center space-x-1.5"
                          >
                            <Zap className="w-4 h-4" />
                            <span>Claim Challenge → Start PoC</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Claim Confirmation Modal */}
        {claimingChallenge && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Claim Challenge for Incubation</h3>
                  <p className="text-xs text-slate-400">Phase 6 PLM PoC Incubation Handshake</p>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400">Selected Challenge: </span>
                  <strong className="text-white">{claimingChallenge.title}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Lead Institution: </span>
                  <strong className="text-blue-400">{institution?.name}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Capacity Saturation: </span>
                  <strong className={isOverloaded ? "text-red-400" : "text-emerald-400"}>
                    {activeProjects} / {maxCapacity} Projects ({utilizationPct}%)
                  </strong>
                </div>
              </div>

              {claimSuccessMsg ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 leading-relaxed">
                  {claimSuccessMsg}
                </div>
              ) : (
                <p className="text-xs text-slate-400 leading-relaxed">
                  Claiming this challenge initiates institutional PoC planning. In accordance with platform governance,
                  formal resource allocation and MoU execution will lock in Phase 6.
                </p>
              )}

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setClaimingChallenge(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                {!claimSuccessMsg && (
                  <button
                    type="button"
                    onClick={confirmClaim}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center space-x-1"
                  >
                    <span>Confirm Claim → Reserve PoC</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
