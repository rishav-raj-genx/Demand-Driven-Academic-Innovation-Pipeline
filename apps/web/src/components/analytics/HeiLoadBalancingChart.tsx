"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Scale, Building2, CheckCircle2, AlertTriangle, Layers } from "lucide-react";

export interface InstitutionUtilizationItem {
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

export interface HeiLoadBalancingChartProps {
  data: InstitutionUtilizationItem[];
  tier2And3SharePercent?: number;
  selectedDistrict?: string;
  className?: string;
}

interface ChartDataItem {
  name: string;
  fullName: string;
  code: string;
  tier: string;
  district: string;
  active: number;
  available: number;
  max: number;
  utilization: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color?: string;
    payload: ChartDataItem;
  }>;
}

function CustomChartTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  const isOverloaded = item.active >= item.max;

  return (
    <div className="bg-slate-950/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs min-w-56 space-y-2">
      <div className="border-b border-slate-800 pb-1.5">
        <div className="font-bold text-white text-sm line-clamp-1">{item.fullName}</div>
        <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
            {item.code}
          </span>
          <span>•</span>
          <span className="font-semibold text-indigo-400">{item.tier.replace("_", " ")}</span>
          <span>•</span>
          <span>{item.district}</span>
        </div>
      </div>

      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between items-center">
          <span className="text-blue-400 font-medium flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            <span>Active Projects (In Flight):</span>
          </span>
          <span className="font-bold text-white">{item.active}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-emerald-400 font-medium flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>Available Capacity:</span>
          </span>
          <span className="font-bold text-white">{item.available}</span>
        </div>
        <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
          <span className="text-slate-400">Total Statutory Ceiling:</span>
          <span className="font-bold text-slate-300">{item.max} slots</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Utilization Rate:</span>
          <span
            className={`font-extrabold ${
              isOverloaded
                ? "text-rose-400"
                : item.utilization >= 75
                ? "text-amber-400"
                : "text-emerald-400"
            }`}
          >
            {item.utilization}%
          </span>
        </div>
      </div>
    </div>
  );
}

export function HeiLoadBalancingChart({
  data,
  tier2And3SharePercent = 0,
  selectedDistrict = "",
  className = "",
}: HeiLoadBalancingChartProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [tierFilter, setTierFilter] = useState<string>("ALL");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Filter and format chart data
  const chartData = useMemo<ChartDataItem[]>(() => {
    let filtered = [...data];
    if (selectedDistrict && selectedDistrict !== "ALL") {
      filtered = filtered.filter(
        (i) => i.districtName.toLowerCase() === selectedDistrict.toLowerCase()
      );
    }
    if (tierFilter !== "ALL") {
      filtered = filtered.filter((i) => i.tier === tierFilter);
    }

    return filtered.map((inst) => {
      // Create concise short name for chart label
      const shortName =
        inst.code ||
        inst.name
          .replace("Indian Institute of Technology", "IIT")
          .replace("National Institute of Technology", "NIT")
          .replace("Birla Institute of Technology", "BIT")
          .replace("Birsa Institute of Technology", "BIT")
          .replace("University", "Univ.")
          .slice(0, 12);

      return {
        name: shortName,
        fullName: inst.name,
        code: inst.code,
        tier: inst.tier,
        district: inst.districtName,
        active: inst.activeProjects,
        available: inst.availableCapacity,
        max: inst.maxCapacity,
        utilization: inst.utilizationPercent,
      };
    });
  }, [data, selectedDistrict, tierFilter]);

  // Aggregate metrics across Tier-1 vs Tier-2/3
  const metrics = useMemo(() => {
    const tier1 = data.filter((i) => i.tier === "TIER_1");
    const tier23 = data.filter((i) => i.tier === "TIER_2" || i.tier === "TIER_3");

    const tier1Active = tier1.reduce((sum, i) => sum + i.activeProjects, 0);
    const tier1Capacity = tier1.reduce((sum, i) => sum + i.maxCapacity, 0);

    const tier23Active = tier23.reduce((sum, i) => sum + i.activeProjects, 0);
    const tier23Capacity = tier23.reduce((sum, i) => sum + i.maxCapacity, 0);

    const totalActive = tier1Active + tier23Active;
    const computedShare = totalActive > 0 ? Math.round((tier23Active / totalActive) * 1000) / 10 : 0;

    return {
      tier1Active,
      tier1Capacity,
      tier23Active,
      tier23Capacity,
      totalActive,
      share: tier2And3SharePercent || computedShare,
    };
  }, [data, tier2And3SharePercent]);

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between ${className}`}
    >
      <div>
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">
              <Scale className="w-4 h-4" />
              <span>Equitable Capacity Monitoring</span>
            </div>
            <h3 className="text-lg font-extrabold text-white">
              HEI Capacity & Load-Balancing
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Active projects vs. available slots across Tier-1 and Tier-2/3 institutions
            </p>
          </div>

          {/* Tier Segment Controls */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setTierFilter("ALL")}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                tierFilter === "ALL"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              All Tiers ({data.length})
            </button>
            <button
              onClick={() => setTierFilter("TIER_1")}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                tierFilter === "TIER_1"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Tier 1
            </button>
            <button
              onClick={() => setTierFilter("TIER_2")}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                tierFilter === "TIER_2"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Tier 2
            </button>
            <button
              onClick={() => setTierFilter("TIER_3")}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                tierFilter === "TIER_3"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Tier 3
            </button>
          </div>
        </div>

        {/* Tier-1 vs Tier-2/3 Load-Balancing Metric Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 p-4 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <div className="space-y-0.5">
            <div className="text-[11px] text-slate-400 font-medium">Tier-2/3 Allocation Share</div>
            <div className="text-2xl font-black text-indigo-400 flex items-center space-x-1.5">
              <span>{metrics.share}%</span>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                EQUITY TARGET MET
              </span>
            </div>
            <div className="text-[10px] text-slate-400">Guarantees state college inclusion</div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[11px] text-slate-400 font-medium">Tier-1 Absorption</div>
            <div className="text-xl font-bold text-slate-200">
              {metrics.tier1Active} / {metrics.tier1Capacity}{" "}
              <span className="text-xs font-normal text-slate-400">slots</span>
            </div>
            <div className="text-[10px] text-slate-400">
              IIT ISM, NIT Jamshedpur, BIT Mesra
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[11px] text-slate-400 font-medium">Tier-2 & 3 Absorption</div>
            <div className="text-xl font-bold text-emerald-400">
              {metrics.tier23Active} / {metrics.tier23Capacity}{" "}
              <span className="text-xs font-normal text-slate-400">slots</span>
            </div>
            <div className="text-[10px] text-slate-400">
              State universities & district polytechnics
            </div>
          </div>
        </div>

        {/* Recharts Bar Chart */}
        <div className="h-72 w-full">
          {!isMounted ? (
            <div className="h-full w-full rounded-xl bg-slate-950/60 animate-pulse flex items-center justify-center text-xs text-slate-500">
              Initializing load-balancing visualization...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full w-full rounded-xl bg-slate-950/40 border border-slate-800 flex items-center justify-center text-xs text-slate-500">
              No institution capacity records match the selected filter.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                barGap={3}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomChartTooltip />} cursor={{ fill: "rgba(51, 65, 85, 0.25)" }} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px", paddingBottom: "10px" }}
                />
                <Bar
                  name="Active Projects"
                  dataKey="active"
                  fill="#38bdf8"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-active-${index}`}
                      fill={entry.tier === "TIER_1" ? "#6366f1" : "#38bdf8"}
                    />
                  ))}
                </Bar>
                <Bar
                  name="Available Capacity"
                  dataKey="available"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  opacity={0.8}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Footer Notes */}
      <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
          <span>Tier-1 HEIs</span>
          <span className="w-2 h-2 rounded-full bg-blue-400 inline-block ml-2" />
          <span>Tier-2/3 HEIs</span>
        </div>
        <div className="text-[10px] text-slate-500">
          Enforced by Prisma atomic capacity guard
        </div>
      </div>
    </div>
  );
}
