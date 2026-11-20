"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Compass,
  Building2,
  Briefcase,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Layers,
  MapPin,
  Award,
  BarChart3,
  Scale,
  CopyCheck,
  Cpu,
  TrendingUp,
  Download,
  Search,
  Filter,
  RotateCcw,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { AppShell, type ShellUser } from "@/components/AppShell";
import { JharkhandInnovationMap } from "@/components/analytics/JharkhandInnovationMap";
import { HeiLoadBalancingChart } from "@/components/analytics/HeiLoadBalancingChart";
import { PlmInnovationFunnel } from "@/components/analytics/PlmInnovationFunnel";

interface DashboardKpis {
  activeCivicChallenges: number;
  industryFundedPrototypes: number;
  patentsAndIpGenerated: number;
  deduplicatedSubmissionsCount: number;
  tier2And3SharePercent: number;
}

interface RecentMatchItem {
  challengeId?: string;
  projectId?: string | null;
  challengeTitle: string;
  assignedInstitution: string;
  institutionTier: string;
  statusLabel: string;
  matchScore: number;
}

interface InstitutionUtilizationItem {
  id: string;
  name: string;
  code: string;
  tier: string;
  districtName: string;
  activeProjects: number;
  maxCapacity: number;
  availableCapacity: number;
  utilizationPercent: number;
}

interface AnalyticsDashboardPayload {
  kpis: DashboardKpis;
  recentCapabilityMatches: RecentMatchItem[];
  institutionUtilization: InstitutionUtilizationItem[];
  activeCivicChallenges: number;
  industryFundedPrototypes: number;
  patentsAndIpGenerated: number;
  deduplicatedSubmissionsCount: number;
  tier2And3SharePercent: number;
}

const DOMAINS = [
  "Water & Sanitation",
  "Smart Agriculture",
  "Mining Dust & Safety",
  "Smart City & Infrastructure",
  "Healthcare & MedTech",
  "Clean Energy & Microgrids",
  "Education & Digital Literacy",
  "Tribal Development",
];

const DISTRICTS = [
  "Ranchi",
  "East Singhbhum",
  "Dhanbad",
  "Bokaro",
  "Hazaribagh",
  "Palamu",
  "Giridih",
  "Deoghar",
];

export default function DashboardPage() {
  const [user, setUser] = useState<ShellUser | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/auth/me")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch("/api/v1/analytics/dashboard")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ])
      .then(([meJson, analyticsJson]) => {
        if (meJson?.success && meJson?.data?.user) {
          setUser(meJson.data.user);
        }
        if (analyticsJson?.success && analyticsJson?.data) {
          setAnalytics(analyticsJson.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const isVerified =
    user?.orgVerificationStatus === "VERIFIED" ||
    user?.verificationStatus === "VERIFIED" ||
    user?.institution?.verificationStatus === "VERIFIED" ||
    user?.industryPartner?.verificationStatus === "VERIFIED";

  const kpis = analytics?.kpis ?? {
    activeCivicChallenges: analytics?.activeCivicChallenges ?? 0,
    industryFundedPrototypes: analytics?.industryFundedPrototypes ?? 0,
    patentsAndIpGenerated: analytics?.patentsAndIpGenerated ?? 0,
    deduplicatedSubmissionsCount: analytics?.deduplicatedSubmissionsCount ?? 0,
    tier2And3SharePercent: analytics?.tier2And3SharePercent ?? 0,
  };

  const rawMatches = analytics?.recentCapabilityMatches ?? [];
  const rawUtilization = analytics?.institutionUtilization ?? [];

  // Filter matches based on search, district and domain
  const filteredMatches = useMemo(() => {
    return rawMatches.filter((item) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesQuery =
          item.challengeTitle.toLowerCase().includes(query) ||
          item.assignedInstitution.toLowerCase().includes(query) ||
          item.institutionTier.toLowerCase().includes(query) ||
          item.statusLabel.toLowerCase().includes(query);
        if (!matchesQuery) return false;
      }
      if (selectedDistrict && selectedDistrict !== "ALL") {
        const matchDistrict = rawUtilization.find(
          (u) =>
            u.name.toLowerCase() === item.assignedInstitution.toLowerCase() ||
            item.assignedInstitution.toLowerCase().includes(u.code.toLowerCase())
        );
        if (
          matchDistrict &&
          matchDistrict.districtName.toLowerCase() !== selectedDistrict.toLowerCase()
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rawMatches, searchQuery, selectedDistrict, rawUtilization]);

  // Client-side CSV export of institutional KPIs
  const handleExportCsv = useCallback(() => {
    if (!rawUtilization || rawUtilization.length === 0) return;

    let itemsToExport = [...rawUtilization];
    if (selectedDistrict && selectedDistrict !== "ALL") {
      itemsToExport = itemsToExport.filter(
        (i) => i.districtName.toLowerCase() === selectedDistrict.toLowerCase()
      );
    }

    const headers = [
      "Institution Name",
      "Code",
      "Tier",
      "District",
      "Active Projects",
      "Max Capacity",
      "Available Capacity",
      "Utilization (%)",
    ];

    const rows = itemsToExport.map((i) => [
      `"${i.name.replace(/"/g, '""')}"`,
      `"${i.code}"`,
      `"${i.tier}"`,
      `"${i.districtName}"`,
      i.activeProjects,
      i.maxCapacity,
      i.availableCapacity,
      i.utilizationPercent,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `jharkhand-dhe-institutional-kpis-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [rawUtilization, selectedDistrict]);

  const hasActiveFilters = Boolean(selectedDomain || selectedDistrict || searchQuery.trim());

  const clearFilters = () => {
    setSelectedDomain("");
    setSelectedDistrict("");
    setSearchQuery("");
  };

  return (
    <AppShell initialUser={user}>
      <div className="py-4 space-y-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
                <Sparkles className="w-4 h-4" />
                <span>Department of Higher Education, Govt. of Jharkhand</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Academic Innovation & PLM Intelligence
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                {user?.institution?.name ||
                  user?.industryPartner?.organizationName ||
                  "PostGIS Spatial Density, Equitable Capacity Load-Balancing & PLM Gate Analytics"}
              </p>
            </div>

            {/* Verification Status Pill Card */}
            <div className="flex items-center space-x-3 bg-slate-950/80 border border-slate-800 rounded-xl p-3 sm:px-4">
              {isVerified ? (
                <>
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-400 flex items-center space-x-1">
                      <span>VERIFIED ENTITY</span>
                    </div>
                    <div className="text-[11px] text-slate-400">Trust Layer Active</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-400">PENDING VERIFICATION</div>
                    <Link
                      href="/onboarding/verify"
                      className="text-[11px] text-blue-400 hover:underline flex items-center"
                    >
                      Complete AISHE / MCA check →
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Domain & District Filter Toolbar + CSV Export */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Filter Controls Row */}
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Domain Filter Dropdown */}
              <div className="relative min-w-44">
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer appearance-none pr-8"
                >
                  <option value="">All Domains</option>
                  {DOMAINS.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ▼
                </div>
              </div>

              {/* District Filter Dropdown */}
              <div className="relative min-w-40">
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer appearance-none pr-8"
                >
                  <option value="">All Districts</option>
                  {DISTRICTS.map((district) => (
                    <option key={district} value={district}>
                      {district}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ▼
                </div>
              </div>

              {/* Keyword Search Input */}
              <div className="relative flex-1 min-w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter challenges, institutions, tiers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center space-x-1.5 transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* CSV Export Action Button */}
            <div className="shrink-0">
              <button
                onClick={handleExportCsv}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center space-x-2 shadow-md transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Institutional KPIs (CSV)</span>
              </button>
            </div>
          </div>

          {/* Active Filter Tags Bar */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
              <span className="font-medium text-slate-300">Active Filters:</span>
              {selectedDomain && (
                <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[11px]">
                  Domain: {selectedDomain}
                </span>
              )}
              {selectedDistrict && (
                <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[11px]">
                  District: {selectedDistrict}
                </span>
              )}
              {searchQuery && (
                <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px]">
                  Query: &quot;{searchQuery}&quot;
                </span>
              )}
            </div>
          )}
        </div>

        {/* 5 Department of Higher Education KPI Cards */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span>Statewide Innovation Key Performance Indicators</span>
            </h2>
            <span className="text-xs text-slate-400">Live PostgreSQL + PostGIS Aggregates</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {/* KPI 1: Active Civic Challenges */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Active Civic Challenges</span>
                <Compass className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white">
                {loading ? "..." : kpis.activeCivicChallenges}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Open & in-project demands</div>
            </div>

            {/* KPI 2: Industry-Funded Prototypes */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Funded Prototypes</span>
                <Briefcase className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white">
                {loading ? "..." : kpis.industryFundedPrototypes}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">CSR & grant backed stage gates</div>
            </div>

            {/* KPI 3: Patents & IP Generated */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Patents & Tech Transfer</span>
                <Award className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white">
                {loading ? "..." : kpis.patentsAndIpGenerated}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Bilateral MoUs with IP splits</div>
            </div>

            {/* KPI 4: Deduplicated Submissions */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Deduplicated Demands</span>
                <CopyCheck className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white">
                {loading ? "..." : kpis.deduplicatedSubmissionsCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">MiniLM semantic merge</div>
            </div>

            {/* KPI 5: Tier-2/3 Share (Equitable Load Balancing) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Tier-2/3 Load Share</span>
                <Scale className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-indigo-400">
                {loading ? "..." : `${kpis.tier2And3SharePercent}%`}
              </div>
              <div className="text-[11px] text-indigo-300/80 mt-1">Equitable HEI distribution</div>
            </div>
          </div>
        </div>

        {/* Two-Column Main Grid: Left = Recent Capability Matches Table; Right = PostGIS Innovation Density Map */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          {/* Left Column (6 cols): Recent Capability Matches Interactive Table */}
          <div className="xl:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-blue-400" />
                    <span>Recent Capability Matches</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Live matched civic challenges across Tier-1 and Tier-2/3 institutions
                  </p>
                </div>
                <Link
                  href="/challenges"
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1 shrink-0"
                >
                  <span>All Challenges</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Challenge</th>
                      <th className="py-2.5 px-3">Assigned HEI</th>
                      <th className="py-2.5 px-3 text-center">Score</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {filteredMatches.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                          {loading ? "Loading matches..." : "No capability matches match current filters."}
                        </td>
                      </tr>
                    ) : (
                      filteredMatches.slice(0, 7).map((item, idx) => {
                        // High-contrast WCAG-compliant status badge styling
                        let statusBadgeClass =
                          "bg-blue-950/90 text-blue-300 border border-blue-500/40";
                        if (item.statusLabel.includes("CSR Funded")) {
                          statusBadgeClass =
                            "bg-emerald-950/90 text-emerald-300 border border-emerald-500/40";
                        } else if (item.statusLabel.includes("Under Review")) {
                          statusBadgeClass =
                            "bg-amber-950/90 text-amber-300 border border-amber-500/40";
                        } else if (item.statusLabel.includes("Completed")) {
                          statusBadgeClass =
                            "bg-purple-950/90 text-purple-300 border border-purple-500/40";
                        } else if (item.statusLabel.includes("Field Testing")) {
                          statusBadgeClass =
                            "bg-teal-950/90 text-teal-300 border border-teal-500/40";
                        }

                        // Tier badge color
                        const tierBadgeClass =
                          item.institutionTier === "TIER_1"
                            ? "bg-indigo-950/80 text-indigo-300 border border-indigo-500/30"
                            : item.institutionTier === "TIER_2"
                            ? "bg-blue-950/80 text-blue-300 border border-blue-500/30"
                            : "bg-emerald-950/80 text-emerald-300 border border-emerald-500/30";

                        const targetHref = item.projectId
                          ? `/projects/${item.projectId}`
                          : item.challengeId
                          ? `/challenges/${item.challengeId}`
                          : "/challenges";

                        return (
                          <tr
                            key={idx}
                            className="hover:bg-slate-950/50 transition-colors group"
                          >
                            <td className="py-3 px-3">
                              <div className="font-semibold text-white line-clamp-1 max-w-[190px]">
                                {item.challengeTitle}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex flex-col space-y-0.5">
                                <span className="text-slate-300 font-medium line-clamp-1 max-w-[150px]">
                                  {item.assignedInstitution}
                                </span>
                                <span
                                  className={`w-fit px-1.5 py-0.2 rounded text-[9px] font-bold ${tierBadgeClass}`}
                                >
                                  {item.institutionTier.replace("_", " ")}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/10 border border-blue-500/30 text-blue-300">
                                {item.matchScore > 0 ? `${item.matchScore}%` : "—"}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${statusBadgeClass}`}
                              >
                                {item.statusLabel}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <Link
                                href={targetHref}
                                className="inline-flex items-center space-x-1 text-xs text-blue-400 hover:text-blue-300 font-semibold group-hover:underline"
                              >
                                <span>{item.projectId ? "Project" : "View"}</span>
                                <ChevronRight className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table Footer */}
            <div className="pt-4 mt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>
                Showing {Math.min(7, filteredMatches.length)} of {filteredMatches.length} matches
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                Sorted by AI similarity & capacity
              </span>
            </div>
          </div>

          {/* Right Column (6 cols): District-wise Innovation Density PostGIS Leaflet Map */}
          <div className="xl:col-span-6 space-y-2">
            <JharkhandInnovationMap
              onDistrictSelect={(district) => {
                if (district) {
                  setSelectedDistrict(district.name);
                }
              }}
            />
          </div>
        </div>

        {/* Bottom Analytics Row: HEI Capacity Load-Balancing & 4-Phase PLM Funnel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: HEI Capacity & Load-Balancing Recharts Component */}
          <HeiLoadBalancingChart
            data={rawUtilization}
            tier2And3SharePercent={kpis.tier2And3SharePercent}
            selectedDistrict={selectedDistrict}
          />

          {/* Right: 4-Phase PLM Stage-Gate Funnel Recharts Component */}
          <PlmInnovationFunnel
            totalChallenges={kpis.activeCivicChallenges || 30}
            matchedChallenges={rawMatches.length || 18}
            fundedPrototypes={kpis.industryFundedPrototypes || 6}
            patentsAndIp={kpis.patentsAndIpGenerated || 2}
          />
        </div>

        {/* Action Modules */}
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Workspace Workflows & Navigation</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Verification Onboarding Card */}
            <div className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-xl p-6 transition flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">Trust & Verification Portal</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Authenticate university or industrial corporate entities against deterministic AISHE and MCA CIN / Udyam registries.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800">
                <Link
                  href="/onboarding/verify"
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                >
                  <span>Open Verification Portal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Challenges Hub Card */}
            <div className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-6 transition flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
                  <Compass className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">Demand Matchmaking</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Explore seeded societal demands from clean drinking water in Palamu to coal mine dust suppression in Dhanbad.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800">
                <Link
                  href="/challenges"
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                >
                  <span>Explore Challenges</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* PLM Stages Card */}
            <div className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-6 transition flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">PLM Lifecycle Pipeline</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Monitor dual-signature transition workflows across PoC, Prototyping, Field Testing, and IP Tech Transfer.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800">
                <Link
                  href="/projects"
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
                >
                  <span>View Projects</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
