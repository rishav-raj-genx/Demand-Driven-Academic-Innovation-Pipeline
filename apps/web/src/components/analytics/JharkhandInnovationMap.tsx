"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  MapPin,
  Filter,
  RotateCcw,
  Sparkles,
  Layers,
  Building2,
  Briefcase,
  Compass,
  X,
  ExternalLink,
  Loader2,
  AlertCircle,
  WifiOff,
  CheckCircle2,
} from "lucide-react";
import type {
  DistrictProperties,
  GeoJsonFeatureCollection,
  JharkhandMapInnerProps,
} from "./JharkhandMapInner";

// Client-only dynamic import of Leaflet map (strictly ssr: false for Next.js App Router)
const JharkhandMapInner = dynamic<JharkhandMapInnerProps>(
  () => import("./JharkhandMapInner"),
  {
    ssr: false,
    loading: () => <MapLoadingSkeleton />,
  }
);

function MapLoadingSkeleton() {
  return (
    <div className="w-full h-[540px] rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col items-center justify-center space-y-3">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      <div className="text-xs font-semibold text-slate-300">
        Loading PostGIS District Spatial Geometries...
      </div>
      <div className="text-[11px] text-slate-500">
        Rendering MultiPolygon boundaries & innovation density markers
      </div>
    </div>
  );
}

const DOMAINS = [
  "Water Filtration",
  "Solar Micro-Grids",
  "Smart Agriculture",
  "Mining Dust/Safety",
  "Tribal Healthcare",
  "Solid Waste",
  "Rural Digital Literacy",
  "Cold Storage",
];

const PHASES = [
  { label: "Proof of Concept (PoC)", value: "POC" },
  { label: "Prototyping", value: "PROTOTYPING" },
  { label: "Field Testing", value: "FIELD_TEST" },
  { label: "IP & Tech Transfer", value: "IP_TECH_TRANSFER" },
];

const TIERS = [
  { label: "Tier 1 (National Institutes)", value: "TIER_1" },
  { label: "Tier 2 (State Universities)", value: "TIER_2" },
  { label: "Tier 3 (Affiliated & Polytechnics)", value: "TIER_3" },
];

export interface JharkhandInnovationMapProps {
  onDistrictSelect?: (district: DistrictProperties | null) => void;
  className?: string;
}

export function JharkhandInnovationMap({
  onDistrictSelect,
  className = "",
}: JharkhandInnovationMapProps) {
  const [data, setData] = useState<GeoJsonFeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [selectedPhase, setSelectedPhase] = useState<string>("");
  const [selectedTier, setSelectedTier] = useState<string>("");

  // Map state
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictProperties | null>(null);
  const [hoveredDistrict, setHoveredDistrict] = useState<DistrictProperties | null>(null);
  const [tileOffline, setTileOffline] = useState(false);

  // Fetch PostGIS GeoJSON
  const fetchSpatialData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (selectedDomain) params.set("domain", selectedDomain);
    if (selectedPhase) params.set("phase", selectedPhase);
    if (selectedTier) params.set("tier", selectedTier);

    try {
      const res = await fetch(`/api/v1/analytics/spatial?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load spatial data: ${res.statusText}`);
      }
      const json: GeoJsonFeatureCollection = await res.json();
      setData(json);

      // If currently selected district is still in data, refresh its props
      if (selectedDistrict) {
        const updated = json.features.find(
          (f) => f.properties.code === selectedDistrict.code
        );
        if (updated) {
          setSelectedDistrict(updated.properties);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading spatial data");
    } finally {
      setLoading(false);
    }
  }, [selectedDomain, selectedPhase, selectedTier, selectedDistrict]);

  useEffect(() => {
    fetchSpatialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomain, selectedPhase, selectedTier]);

  const handleSelectDistrict = (district: DistrictProperties | null) => {
    setSelectedDistrict(district);
    onDistrictSelect?.(district);
  };

  const handleResetFilters = () => {
    setSelectedDomain("");
    setSelectedPhase("");
    setSelectedTier("");
    setSelectedDistrict(null);
    onDistrictSelect?.(null);
  };

  const hasActiveFilters = Boolean(
    selectedDomain || selectedPhase || selectedTier || selectedDistrict
  );

  // Total metrics in current view
  const totalChallengesInView = data?.features?.reduce(
    (sum, f) => sum + (f.properties?.challengeCount || 0),
    0
  ) ?? 0;
  const totalProjectsInView = data?.features?.reduce(
    (sum, f) => sum + (f.properties?.activeProjectCount || 0),
    0
  ) ?? 0;

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 ${className}`}
    >
      {/* Header & Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Jharkhand Innovation Density Map</span>
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Live PostGIS 3.7</span>
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                District choropleth and circular innovation markers powered by PostGIS spatial queries
              </p>
            </div>
          </div>
        </div>

        {/* Live Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Domain Dropdown */}
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Domains</option>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Phase Dropdown */}
          <select
            value={selectedPhase}
            onChange={(e) => setSelectedPhase(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Phases</option>
            {PHASES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          {/* Tier Dropdown */}
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="">All HEI Tiers</option>
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {/* Reset Action */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Offline Wi-Fi Tile Resilient Banner (if tiles fail to load on hackathon Wi-Fi) */}
      {tileOffline && (
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-blue-900/40 text-xs text-blue-300">
          <div className="flex items-center space-x-2">
            <WifiOff className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              Offline vector fallback active — PostGIS district boundaries & innovation bubbles render natively without external tiles.
            </span>
          </div>
          <span className="text-[10px] uppercase font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
            Resilient
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Interactive Map Layout Container */}
      <div className="relative">
        <JharkhandMapInner
          data={data}
          selectedDistrict={selectedDistrict}
          onSelectDistrict={handleSelectDistrict}
          hoveredDistrict={hoveredDistrict}
          onHoverDistrict={setHoveredDistrict}
          tileOffline={tileOffline}
          setTileOffline={setTileOffline}
        />

        {/* Floating Legend Overlay (Bottom Left) */}
        <div className="absolute bottom-4 left-4 z-20 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-2xl text-[11px] space-y-2 pointer-events-auto">
          <div className="font-bold text-white flex items-center justify-between">
            <span>Innovation Density</span>
            <span className="text-[10px] text-slate-400 font-normal">Active Demands</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#4338ca] border border-indigo-400" />
            <span className="text-slate-300">8+ High</span>
            <span className="w-3 h-3 rounded-sm bg-[#2563eb] border border-blue-400 ml-1.5" />
            <span className="text-slate-300">5–7</span>
            <span className="w-3 h-3 rounded-sm bg-[#0284c7] border border-sky-400 ml-1.5" />
            <span className="text-slate-300">3–4</span>
            <span className="w-3 h-3 rounded-sm bg-[#0369a1] border border-sky-500 ml-1.5" />
            <span className="text-slate-300">1–2</span>
            <span className="w-3 h-3 rounded-sm bg-[#1e293b] border border-slate-700 ml-1.5" />
            <span className="text-slate-400">0</span>
          </div>

          <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
            <span>Filtered Demands: <b className="text-white">{totalChallengesInView}</b></span>
            <span>Projects: <b className="text-white">{totalProjectsInView}</b></span>
          </div>
        </div>

        {/* Selected District Click-to-Drilldown Drawer / Card (Floating Right) */}
        {selectedDistrict && (
          <div className="absolute top-4 right-4 z-20 w-80 max-w-[90%] bg-slate-950/95 backdrop-blur-md border border-blue-500/50 rounded-2xl p-4 shadow-2xl space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-1.5 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                  <span>District Drilldown</span>
                  <span>•</span>
                  <span>{selectedDistrict.code}</span>
                </div>
                <h3 className="text-base font-extrabold text-white">
                  {selectedDistrict.name}
                </h3>
              </div>
              <button
                onClick={() => handleSelectDistrict(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <Compass className="w-3 h-3 text-blue-400" />
                  <span>Demands</span>
                </div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {selectedDistrict.challengeCount}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <Building2 className="w-3 h-3 text-indigo-400" />
                  <span>HEIs</span>
                </div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {selectedDistrict.heiCount}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <Layers className="w-3 h-3 text-emerald-400" />
                  <span>Projects</span>
                </div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {selectedDistrict.activeProjectCount}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <Briefcase className="w-3 h-3 text-amber-400" />
                  <span>Funded</span>
                </div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {selectedDistrict.fundedPrototypeCount}
                </div>
              </div>
            </div>

            {/* Top Institution */}
            {selectedDistrict.topInstitution && (
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-2.5 text-xs">
                <div className="text-[10px] font-semibold text-slate-400 mb-1">
                  Leading Higher Ed Institution:
                </div>
                <div className="font-bold text-white line-clamp-1">
                  {selectedDistrict.topInstitution}
                </div>
              </div>
            )}

            {/* Action Links */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <Link
                href={`/challenges?districtId=${selectedDistrict.id}`}
                className="text-blue-400 hover:text-blue-300 font-semibold flex items-center space-x-1"
              >
                <span>Filter Challenges</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
              <button
                onClick={() => handleSelectDistrict(null)}
                className="text-slate-400 hover:text-slate-300"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default JharkhandInnovationMap;
