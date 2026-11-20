"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  Compass,
  ArrowLeft,
  MapPin,
  ThumbsUp,
  Clock,
  Building2,
  Sparkles,
  GitMerge,
  ExternalLink,
  FileText,
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Layers,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";

interface CapabilityMatch {
  id: string;
  similarityScore: number;
  matchRank?: number | null;
  status: string;
  institution: {
    id: string;
    name: string;
    code: string;
    tier: string;
    verificationStatus: string;
  };
}

interface ChallengeDetail {
  id: string;
  title: string;
  problemStatement: string;
  domain?: string | null;
  category?: string | null;
  urgency: string;
  status: string;
  mediaKeys: string[];
  endorsementCount: number;
  createdAt: string;
  canonicalId?: string | null;
  canonicalChallenge?: {
    id: string;
    title: string;
    status: string;
    domain?: string | null;
  } | null;
  duplicateChallenges?: Array<{
    id: string;
    title: string;
    status: string;
    endorsementCount: number;
  }>;
  district?: {
    id: string;
    name: string;
    code: string;
    state: string;
  } | null;
  location?: {
    lat: number;
    lng: number;
  } | null;
  createdBy?: {
    id: string;
    fullName: string;
    role: string;
  } | null;
  industryPartner?: {
    id: string;
    organizationName: string;
    cin?: string | null;
  } | null;
  capabilityMatches: CapabilityMatch[];
}

interface MediaItemState {
  key: string;
  viewUrl?: string;
  loading: boolean;
  error?: string;
}

export default function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Media view URLs
  const [mediaItems, setMediaItems] = useState<MediaItemState[]>([]);

  // Endorsement State
  const [endorsementCount, setEndorsementCount] = useState<number>(0);
  const [isEndorsing, setIsEndorsing] = useState<boolean>(false);
  const [endorseFeedback, setEndorseFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Fetch challenge details
  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/challenges/${id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Challenge not found (status ${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (json.success && json.data) {
          setChallenge(json.data);
          setEndorsementCount(json.data.endorsementCount || 0);

          // Initialize media items
          const keys = json.data.mediaKeys || [];
          setMediaItems(
            keys.map((k: string) => ({
              key: k,
              loading: true,
            }))
          );
        }
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch presigned view URLs for attached media
  useEffect(() => {
    if (!challenge?.mediaKeys || challenge.mediaKeys.length === 0) return;

    challenge.mediaKeys.forEach(async (key, idx) => {
      try {
        const res = await fetch(`/api/v1/uploads/view?key=${encodeURIComponent(key)}`);
        if (res.ok) {
          const json = await res.json();
          setMediaItems((prev) => {
            const copy = [...prev];
            copy[idx] = { key, viewUrl: json.data.viewUrl, loading: false };
            return copy;
          });
        } else {
          setMediaItems((prev) => {
            const copy = [...prev];
            copy[idx] = { key, loading: false, error: "Unavailable" };
            return copy;
          });
        }
      } catch {
        setMediaItems((prev) => {
          const copy = [...prev];
          copy[idx] = { key, loading: false, error: "Network error" };
          return copy;
        });
      }
    });
  }, [challenge?.mediaKeys]);

  // Handle Endorsement Click
  const handleEndorse = async () => {
    if (isEndorsing) return;
    setIsEndorsing(true);
    setEndorseFeedback(null);

    try {
      const res = await fetch(`/api/v1/challenges/${id}/endorse`, {
        method: "POST",
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setEndorsementCount(json.data.endorsementCount);
        setEndorseFeedback({
          success: true,
          message: "Thank you! Your endorsement has been registered.",
        });
      } else {
        setEndorseFeedback({
          success: false,
          message: json?.error?.message || "You have already endorsed this challenge recently.",
        });
      }
    } catch {
      setEndorseFeedback({
        success: false,
        message: "Failed to connect to endorsement service. Check connection.",
      });
    } finally {
      setIsEndorsing(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="py-24 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-xs text-slate-400">Loading challenge details & AI matches...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !challenge) {
    return (
      <AppShell>
        <div className="py-12 max-w-xl mx-auto text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">Challenge Not Found</h2>
          <p className="text-xs text-slate-400">{error || "The requested challenge does not exist."}</p>
          <Link
            href="/challenges"
            className="inline-flex items-center space-x-1 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Challenges</span>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto py-4 sm:py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400">
          <Link
            href="/challenges"
            className="flex items-center space-x-1 hover:text-blue-400 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Challenge Explorer</span>
          </Link>
          <span>/</span>
          <span className="text-slate-300 truncate max-w-md">{challenge.title}</span>
        </div>

        {/* ================================================================== */}
        {/* Duplicate-Merge Banner (If merged into canonical parent) */}
        {/* ================================================================== */}
        {challenge.canonicalChallenge && (
          <div className="bg-purple-950/40 border border-purple-800/80 rounded-2xl p-5 text-purple-200 shadow-md">
            <div className="flex items-start space-x-3">
              <GitMerge className="w-6 h-6 text-purple-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-sm text-purple-100">
                    Merged Duplicate Challenge
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-900 text-purple-300 border border-purple-700">
                    94% Semantic Similarity
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300">
                  This challenge was automatically identified as a near-duplicate and merged into the canonical parent challenge for combined research execution.
                </p>
                <div className="mt-3">
                  <Link
                    href={`/challenges/${challenge.canonicalChallenge.id}`}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-purple-300 hover:text-purple-200 underline"
                  >
                    <span>View Canonical Challenge: &quot;{challenge.canonicalChallenge.title}&quot;</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Challenge Narrative Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
          {/* Header Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded text-xs font-bold bg-blue-950 text-blue-300 border border-blue-800">
                {challenge.status}
              </span>
              <span className="px-2.5 py-1 rounded text-xs font-medium bg-slate-950 text-slate-300 border border-slate-800">
                {challenge.domain || challenge.category || "General"}
              </span>
              <span
                className={`px-2.5 py-1 rounded text-xs font-bold ${
                  challenge.urgency === "CRITICAL"
                    ? "bg-red-950 text-red-300 border border-red-800"
                    : challenge.urgency === "HIGH"
                    ? "bg-amber-950 text-amber-300 border border-amber-800"
                    : "bg-slate-950 text-slate-400 border border-slate-800"
                }`}
              >
                {challenge.urgency} Urgency
              </span>
            </div>

            {challenge.district && (
              <div className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-300 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {challenge.district.name}, {challenge.district.state} ({challenge.district.code})
                </span>
              </div>
            )}
          </div>

          {/* Title */}
          <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
            {challenge.title}
          </h1>

          {/* Location & Metadata Bar */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1 pb-3 border-b border-slate-800">
            {challenge.location && (
              <span>
                Coordinates: {challenge.location.lat.toFixed(4)}°N, {challenge.location.lng.toFixed(4)}°E
              </span>
            )}
            <span>•</span>
            <span>
              Submitted by: {challenge.createdBy?.fullName || "Citizen Innovator"} (
              {challenge.createdBy?.role || "CITIZEN"})
            </span>
            <span>•</span>
            <span>
              Created: {new Date(challenge.createdAt).toLocaleDateString()}
            </span>
          </div>

          {/* Problem Statement Narrative */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Problem Narrative & Civic Demand
            </h2>
            <div className="text-sm sm:text-base text-slate-200 leading-relaxed whitespace-pre-line bg-slate-950/60 p-5 rounded-xl border border-slate-800/80">
              {challenge.problemStatement}
            </div>
          </div>

          {/* Endorsement Call-To-Action */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <ThumbsUp className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold text-white">
                  {endorsementCount} Citizen Endorsement{endorsementCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Community endorsements prioritize challenges for university matching and state innovation funding.
              </p>
            </div>

            <button
              type="button"
              onClick={handleEndorse}
              disabled={isEndorsing}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition"
            >
              <ThumbsUp className={`w-3.5 h-3.5 ${isEndorsing ? "animate-pulse" : ""}`} />
              <span>{isEndorsing ? "Recording..." : "Endorse this Challenge"}</span>
            </button>
          </div>

          {endorseFeedback && (
            <p
              className={`text-xs ${
                endorseFeedback.success ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {endorseFeedback.message}
            </p>
          )}

          {/* ================================================================ */}
          {/* Media Attachments Gallery (Presigned GET URLs) */}
          {/* ================================================================ */}
          {mediaItems.length > 0 && (
            <div className="space-y-3 pt-2">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <FileText className="w-4 h-4 text-purple-400" />
                <span>Field Artifacts & Photos ({mediaItems.length})</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {mediaItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-3 flex flex-col justify-between"
                  >
                    <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center mb-2">
                      {item.loading ? (
                        <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
                      ) : item.viewUrl && item.key.match(/\.(png|jpg|jpeg|webp)$/i) ? (
                        <img
                          src={item.viewUrl}
                          alt={`Attachment ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-2">
                          <FileText className="w-8 h-8 text-blue-400 mx-auto mb-1" />
                          <span className="text-[10px] text-slate-400 truncate block">
                            Document / PDF
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                        {item.key.split("/").pop()}
                      </span>
                      {item.viewUrl ? (
                        <a
                          href={item.viewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1 text-blue-400 hover:text-blue-300 font-semibold text-[11px]"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-500">
                          {item.error || "Loading..."}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ================================================================== */}
        {/* Top AI-Matched HEIs Panel (Ready for Phase 4-5 Data) */}
        {/* ================================================================== */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Top AI-Matched Higher Education Institutions
              </h2>
            </div>
            <span className="text-xs text-slate-400">pgvector Semantic Match</span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            The SIH AI Engine continuously matches challenge problem statements against institutional patent portfolios, faculty research profiles, and capacity controls across Jharkhand universities.
          </p>

          {challenge.capabilityMatches.length > 0 ? (
            <div className="space-y-3">
              {challenge.capabilityMatches.map((match, idx) => (
                <div
                  key={match.id}
                  className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-4"
                >
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 rounded-full bg-blue-900 text-blue-300 text-xs font-bold flex items-center justify-center">
                      #{match.matchRank || idx + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {match.institution.name}
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        AISHE: {match.institution.code} • {match.institution.tier} • {match.institution.verificationStatus}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-extrabold text-emerald-400">
                      {(match.similarityScore * 100).toFixed(1)}% Match
                    </span>
                    <span className="block text-[10px] text-slate-500 uppercase">
                      {match.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-slate-800 rounded-xl p-6 text-center space-y-2 bg-slate-950/40">
              <Building2 className="w-8 h-8 text-slate-600 mx-auto" />
              <h4 className="text-xs font-bold text-slate-300">
                Automated AI Capability Matching In Progress
              </h4>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                Background worker is generating 384-dimensional dense semantic embeddings to match this challenge against NIT Jamshedpur, BIT Mesra, and regional universities.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
