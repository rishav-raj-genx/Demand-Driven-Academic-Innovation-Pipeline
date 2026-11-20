"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  FolderGit2,
  Search,
  Filter,
  Building2,
  Briefcase,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  Layers,
  GraduationCap,
  Banknote,
  ShieldCheck,
  ChevronRight,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";

interface ProjectMemberItem {
  id: string;
  role: string;
  user: {
    id: string;
    fullName: string;
    role: string;
    email: string;
  };
}

interface MilestoneSummaryItem {
  id: string;
  title: string;
  phase: string;
  status: string;
  isCompleted: boolean;
}

interface ProjectListItem {
  id: string;
  title: string;
  description: string;
  currentPhase: "POC" | "PROTOTYPING" | "FIELD_TEST" | "IP_TECH_TRANSFER";
  fundingStatus: "UNFUNDED" | "CSR_PLEDGED" | "CSR_FUNDED" | "INDUSTRY_FUNDED";
  budget?: string | number | null;
  startDate?: string | null;
  targetCompletionDate?: string | null;
  institution: {
    id: string;
    name: string;
    code: string;
    tier: string;
    district?: { name: string; state: string } | null;
  };
  industryPartner?: {
    id: string;
    organizationName: string;
    cin?: string | null;
    verificationStatus: string;
  } | null;
  challenge?: {
    id: string;
    title: string;
    problemStatement: string;
    district?: { name: string; state: string } | null;
  } | null;
  projectMembers?: ProjectMemberItem[];
  milestones?: MilestoneSummaryItem[];
  nepCreditSummary?: {
    totalCreditsPossible: number;
    earnedCredits: number;
    eligibleCredits: number;
    creditsByPhase: Record<string, { value: number; completed: boolean; inProgress: boolean }>;
  };
}

const PHASES = [
  { key: "ALL", label: "All Phases" },
  { key: "POC", label: "PoC" },
  { key: "PROTOTYPING", label: "Prototyping" },
  { key: "FIELD_TEST", label: "Field Test" },
  { key: "IP_TECH_TRANSFER", label: "IP & Tech Transfer" },
];

const FUNDING_STATUSES = [
  { key: "ALL", label: "All Funding" },
  { key: "CSR_FUNDED", label: "CSR Funded" },
  { key: "CSR_PLEDGED", label: "CSR Pledged" },
  { key: "INDUSTRY_FUNDED", label: "Industry Funded" },
  { key: "UNFUNDED", label: "Unfunded" },
];

const PHASE_ORDER = ["POC", "PROTOTYPING", "FIELD_TEST", "IP_TECH_TRANSFER"] as const;

export default function ProjectsDirectoryPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedPhase, setSelectedPhase] = useState("ALL");
  const [selectedFunding, setSelectedFunding] = useState("ALL");

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (selectedPhase !== "ALL") params.set("phase", selectedPhase);

      const res = await fetch(`/api/v1/projects?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch projects (HTTP ${res.status})`);
      }
      const json = await res.json();
      let list: ProjectListItem[] = Array.isArray(json.data) ? json.data : [];

      if (selectedFunding !== "ALL") {
        list = list.filter((p) => p.fundingStatus === selectedFunding);
      }

      setProjects(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [search, selectedPhase, selectedFunding]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                <FolderGit2 className="w-6 h-6" />
              </span>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Project Lifecycle (PLM) Workspace
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Collaborative 4-stage academic-industry innovation pipeline with cryptographic Dual-Signature gates, off-platform CSR milestone tracking, and NEP 2020 experiential credit accrual.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchProjects()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/challenges"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              Match & Claim Challenge
            </Link>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search projects by title, institution, or challenge keywords..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mr-1">
                <Filter className="w-3.5 h-3.5" />
                <span>Phase:</span>
              </div>
              <div className="inline-flex p-1 bg-slate-100 rounded-lg">
                {PHASES.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setSelectedPhase(p.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                      selectedPhase === p.key
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Funding Status filter bar */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5" />
              Funding Status:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {FUNDING_STATUSES.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setSelectedFunding(f.key)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition ${
                    selectedFunding === f.key
                      ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Project Cards List */}
        {loading ? (
          <div className="py-24 text-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Loading active research & development pipelines...</p>
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
            <p className="text-sm font-semibold text-red-800">Error Loading Projects</p>
            <p className="text-xs text-red-600">{error}</p>
            <button
              onClick={() => fetchProjects()}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
            <Layers className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-semibold text-slate-900">No Projects Found</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              No active projects match the selected filters. HEI faculty leads can match with civic/industrial challenges and claim them into the 4-phase PLM pipeline.
            </p>
            <Link
              href="/challenges"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition shadow-sm"
            >
              Browse Open Challenges
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {projects.map((project) => {
              const currentPhaseIndex = PHASE_ORDER.indexOf(
                project.currentPhase as (typeof PHASE_ORDER)[number]
              );
              const funding = project.fundingStatus;

              return (
                <div
                  key={project.id}
                  className="bg-white rounded-xl border border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow-md transition duration-200 p-6 flex flex-col justify-between gap-6"
                >
                  <div className="space-y-4">
                    {/* Top Status & Phase Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {project.currentPhase.replace("_", " ")} Phase
                        </span>
                        {funding === "CSR_FUNDED" && (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            CSR Funded
                          </span>
                        )}
                        {funding === "CSR_PLEDGED" && (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            CSR Pledged
                          </span>
                        )}
                        {funding === "INDUSTRY_FUNDED" && (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                            <Banknote className="w-3.5 h-3.5" />
                            Industry Funded
                          </span>
                        )}
                        {funding === "UNFUNDED" && (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-600">
                            Unfunded
                          </span>
                        )}
                      </div>

                      {project.nepCreditSummary && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md font-medium">
                          <GraduationCap className="w-3.5 h-3.5 text-amber-700" />
                          <span>
                            NEP 2020: <strong>{project.nepCreditSummary.earnedCredits}</strong> /{" "}
                            {project.nepCreditSummary.eligibleCredits} Credits
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Title & Description */}
                    <div>
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-lg font-bold text-slate-900 hover:text-indigo-600 transition"
                      >
                        {project.title}
                      </Link>
                      <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                        {project.description || project.challenge?.problemStatement}
                      </p>
                    </div>

                    {/* 4-Stage Stepper Preview */}
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        {PHASE_ORDER.map((phaseKey, idx) => {
                          const isDone = idx < currentPhaseIndex;
                          const isCurrent = idx === currentPhaseIndex;
                          return (
                            <div key={phaseKey} className="flex flex-col items-center">
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center font-bold mb-1 transition ${
                                  isDone
                                    ? "bg-emerald-500 text-white"
                                    : isCurrent
                                    ? "bg-indigo-600 text-white ring-2 ring-indigo-300 ring-offset-1"
                                    : "bg-slate-200 text-slate-500"
                                }`}
                              >
                                {isDone ? "✓" : idx + 1}
                              </div>
                              <span
                                className={`text-[11px] font-medium truncate max-w-full ${
                                  isCurrent ? "text-indigo-700 font-bold" : "text-slate-600"
                                }`}
                              >
                                {phaseKey === "POC"
                                  ? "PoC"
                                  : phaseKey === "PROTOTYPING"
                                  ? "Prototype"
                                  : phaseKey === "FIELD_TEST"
                                  ? "Field Test"
                                  : "IP Transfer"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Stakeholders Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">
                          <strong>HEI:</strong> {project.institution.name} ({project.institution.tier.replace("_", " ")})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">
                          <strong>Industry:</strong>{" "}
                          {project.industryPartner ? (
                            <span className="text-slate-900 font-medium">
                              {project.industryPartner.organizationName}
                            </span>
                          ) : (
                            <span className="text-amber-600 italic">Seeking Partner / Unassigned</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      {project.milestones && (
                        <span>
                          <strong>{project.milestones.filter((m) => m.isCompleted).length}</strong>/
                          {project.milestones.length} Milestones
                        </span>
                      )}
                      {project.projectMembers && (
                        <span>
                          <strong>{project.projectMembers.length}</strong> Team Members
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/projects/${project.id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                    >
                      Open PLM Workspace
                      <ChevronRight className="w-4 h-4" />
                    </Link>
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
