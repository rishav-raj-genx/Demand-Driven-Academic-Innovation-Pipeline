"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Compass,
  Search,
  Filter,
  Plus,
  MapPin,
  ThumbsUp,
  Clock,
  Layers,
  Inbox,
  RefreshCw,
  X,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  listPendingChallenges,
  syncOfflineOutbox,
  type OutboxChallengeItem,
} from "@/lib/offline/outbox";

const DOMAIN_OPTIONS = [
  "All Domains",
  "Water Filtration",
  "Solar Micro-Grids",
  "Tribal Healthcare",
  "Smart Agriculture",
  "Mining Dust/Safety",
  "Solid Waste",
  "Rural Digital Literacy",
  "Cold Storage",
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "OPEN", label: "Open" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "MATCHED", label: "Matched" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
];

interface ChallengeItem {
  id: string;
  title: string;
  problemStatement: string;
  domain?: string | null;
  category?: string | null;
  urgency: string;
  status: string;
  endorsementCount: number;
  canonicalId?: string | null;
  createdAt: string;
  district?: {
    id: string;
    name: string;
    code: string;
  } | null;
  _count?: {
    capabilityMatches: number;
  };
}

export default function ChallengesExplorerPage() {
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("All Domains");
  const [status, setStatus] = useState("");
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Offline Outbox Drawer State
  const [isOutboxOpen, setIsOutboxOpen] = useState(false);
  const [outboxItems, setOutboxItems] = useState<OutboxChallengeItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch pending offline outbox items
  const loadOutbox = useCallback(async () => {
    try {
      const items = await listPendingChallenges();
      setOutboxItems(items);
    } catch {
      // IndexedDB not ready
    }
  }, []);

  // Fetch live challenges from GET /api/v1/challenges
  const fetchChallenges = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "12");
      if (search.trim()) params.set("search", search.trim());
      if (domain !== "All Domains") params.set("domain", domain);
      if (status) params.set("status", status);
      if (includeDuplicates) params.set("includeDuplicates", "true");

      const res = await fetch(`/api/v1/challenges?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setChallenges(json.data || []);
        if (json.meta) {
          setTotalPages(json.meta.totalPages || 1);
          setTotal(json.meta.total || 0);
        }
      }
    } catch (err) {
      console.warn("[Challenges] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, domain, status, includeDuplicates]);

  useEffect(() => {
    fetchChallenges();
    loadOutbox();
  }, [fetchChallenges, loadOutbox]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncOfflineOutbox();
      await loadOutbox();
      await fetchChallenges();
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusBadge = (item: ChallengeItem) => {
    if (item.canonicalId) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-950/80 text-purple-300 border border-purple-800">
          DUPLICATE_MERGED
        </span>
      );
    }

    switch (item.status) {
      case "SUBMITTED":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800">
            SUBMITTED
          </span>
        );
      case "MATCHED":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            MATCHED
          </span>
        );
      case "IN_PROGRESS":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-800">
            IN_PROJECT
          </span>
        );
      case "OPEN":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-950/80 text-blue-300 border border-blue-800">
            OPEN
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            {item.status}
          </span>
        );
    }
  };

  return (
    <AppShell>
      <div className="py-4 sm:py-8 space-y-6">
        {/* Top Header & CTA Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
              <Compass className="w-4 h-4" />
              <span>Grassroots Demands & Research Pipeline</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Challenge Explorer
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">
              Browse {total} civic and industrial challenges across Jharkhand districts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Outbox Drawer Trigger Button */}
            <button
              type="button"
              onClick={() => setIsOutboxOpen(true)}
              className="relative inline-flex items-center space-x-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition"
            >
              <Inbox className="w-4 h-4 text-amber-400" />
              <span>Offline Outbox</span>
              {outboxItems.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                  {outboxItems.length}
                </span>
              )}
            </button>

            {/* New Challenge Submission CTA */}
            <Link
              href="/challenges/new"
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              <span>Submit Challenge</span>
            </Link>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="sm:col-span-5 relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search challenges by keyword (e.g. fluoride, arsenic, solar)..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Domain Dropdown */}
            <div className="sm:col-span-4">
              <select
                value={domain}
                onChange={(e) => {
                  setDomain(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {DOMAIN_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Dropdown */}
            <div className="sm:col-span-3">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Second Row: Include Duplicates Toggle */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDuplicates}
                onChange={(e) => {
                  setIncludeDuplicates(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-0"
              />
              <span>Include merged duplicate challenges (showing deduplication hierarchy)</span>
            </label>

            <span>
              Showing {challenges.length} of {total} records
            </span>
          </div>
        </div>

        {/* Challenges Grid List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-400">Loading academic innovation pipeline...</p>
          </div>
        ) : challenges.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
            <Compass className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-white">No challenges match your filters</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Try adjusting your search keywords, clearing status filters, or submit a new grassroots challenge for your district.
            </p>
            <button
              onClick={() => {
                setSearch("");
                setDomain("All Domains");
                setStatus("");
                setIncludeDuplicates(false);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {challenges.map((item) => (
              <Link
                key={item.id}
                href={`/challenges/${item.id}`}
                className="group flex flex-col justify-between bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 transition shadow-sm hover:shadow-lg"
              >
                <div>
                  {/* Status & District Badge Bar */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    {getStatusBadge(item)}

                    {item.district && (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-slate-400">
                        <MapPin className="w-3 h-3 text-emerald-400" />
                        <span>{item.district.name}</span>
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-blue-400 transition line-clamp-2">
                    {item.title}
                  </h3>

                  {/* Narrative snippet */}
                  <p className="mt-2 text-xs text-slate-300 line-clamp-3 leading-relaxed">
                    {item.problemStatement}
                  </p>
                </div>

                {/* Footer Meta */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center space-x-3">
                    <span className="inline-flex items-center space-x-1">
                      <ThumbsUp className="w-3.5 h-3.5 text-blue-400" />
                      <span>{item.endorsementCount}</span>
                    </span>

                    <span className="px-2 py-0.5 bg-slate-950 rounded text-[10px] text-slate-400 border border-slate-800">
                      {item.domain || item.category || "General"}
                    </span>
                  </div>

                  <span className="text-blue-400 flex items-center group-hover:translate-x-0.5 transition font-semibold text-[11px]">
                    Details <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center space-x-3 pt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 hover:border-slate-700 transition"
            >
              Previous
            </button>
            <span className="text-xs text-slate-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 hover:border-slate-700 transition"
            >
              Next
            </button>
          </div>
        )}

        {/* ================================================================== */}
        {/* Pending Offline Queue Drawer Modal */}
        {/* ================================================================== */}
        {isOutboxOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Inbox className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">Pending Offline Queue</h3>
                </div>
                <button
                  onClick={() => setIsOutboxOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Submissions created while disconnected are stored in your device&apos;s IndexedDB outbox. When online, they sync automatically or can be manually triggered below.
              </p>

              {outboxItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  No drafts currently queued in offline outbox.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {outboxItems.map((draft) => (
                    <div
                      key={draft.clientIdempotencyKey}
                      className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="truncate mr-3">
                        <div className="font-bold text-slate-200 truncate">
                          {draft.payload.title}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {draft.mediaFiles.length} photo(s) • Status:{" "}
                          <span
                            className={
                              draft.status === "FAILED"
                                ? "text-red-400 font-bold"
                                : draft.status === "SYNCING"
                                ? "text-blue-400"
                                : "text-amber-400"
                            }
                          >
                            {draft.status}
                          </span>
                        </div>
                      </div>

                      <span className="text-[10px] text-slate-500 shrink-0">
                        {new Date(draft.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 flex justify-between items-center">
                <span className="text-xs text-slate-400">{outboxItems.length} draft(s) stored</span>
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing || outboxItems.length === 0}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900/50 text-white rounded-xl text-xs font-bold transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                  <span>{isSyncing ? "Syncing..." : "Sync All Now"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
