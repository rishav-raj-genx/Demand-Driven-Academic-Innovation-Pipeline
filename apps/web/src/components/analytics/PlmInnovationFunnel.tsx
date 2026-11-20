"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Layers,
  ArrowRight,
  ShieldCheck,
  Award,
  Briefcase,
  Compass,
  Cpu,
  GraduationCap,
} from "lucide-react";

export interface PlmInnovationFunnelProps {
  totalChallenges?: number;
  matchedChallenges?: number;
  fundedPrototypes?: number;
  patentsAndIp?: number;
  className?: string;
}

interface FunnelStage {
  stage: string;
  name: string;
  count: number;
  conversion: string;
  nepCredits: string;
  gate: string;
  description: string;
  color: string;
}

export function PlmInnovationFunnel({
  totalChallenges = 30,
  matchedChallenges = 18,
  fundedPrototypes = 6,
  patentsAndIp = 2,
  className = "",
}: PlmInnovationFunnelProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Compute percentages relative to intake
  const baseline = Math.max(1, totalChallenges);
  const matchedPct = Math.round((matchedChallenges / baseline) * 100);
  const fundedPct = Math.round((fundedPrototypes / baseline) * 100);
  const patentPct = Math.round((patentsAndIp / baseline) * 100);

  const stages: FunnelStage[] = [
    {
      stage: "Stage 1",
      name: "Verified Demands",
      count: totalChallenges,
      conversion: "100%",
      nepCredits: "Demand Intake",
      gate: "AISHE & MCA Trust Layer",
      description: "Crowdsourced civic & industrial challenges verified & deduplicated",
      color: "#38bdf8", // Sky 400
    },
    {
      stage: "Stage 2",
      name: "AI Capability Matched",
      count: matchedChallenges,
      conversion: `${matchedPct}%`,
      nepCredits: "+2 NEP Credits",
      gate: "MiniLM 384-Dim & Capacity Guard",
      description: "Equitable matching across Tier-1 and Tier-2/3 Jharkhand HEIs",
      color: "#6366f1", // Indigo 500
    },
    {
      stage: "Stage 3",
      name: "CSR Prototypes",
      count: fundedPrototypes,
      conversion: `${fundedPct}%`,
      nepCredits: "+4 NEP Credits",
      gate: "Dual-Signature PoC Gate",
      description: "Off-platform CSR grants & prototyping stage gates co-signed",
      color: "#10b981", // Emerald 500
    },
    {
      stage: "Stage 4",
      name: "Patents & IP Transfer",
      count: patentsAndIp,
      conversion: `${patentPct}%`,
      nepCredits: "+8 NEP Credits",
      gate: "Bilateral MoU & Dual-Signature",
      description: "Mutual IP splits, statutory non-custodial MoUs & commercialization",
      color: "#f59e0b", // Amber 500
    },
  ];

  const chartData = stages.map((s) => ({
    name: s.name,
    count: s.count,
    conversion: s.conversion,
    color: s.color,
  }));

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between ${className}`}
    >
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
              <Layers className="w-4 h-4" />
              <span>Demand-Driven Pipeline</span>
            </div>
            <h3 className="text-lg font-extrabold text-white">
              4-Phase PLM Stage-Gate Funnel
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified Challenges → AI Matched → CSR Prototypes → Patents & IP
            </p>
          </div>

          <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Dual-Signature Governed</span>
          </div>
        </div>

        {/* Funnel Stage Progression Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 my-5">
          {stages.map((st, idx) => (
            <div
              key={st.stage}
              className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2 relative overflow-hidden"
            >
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: st.color }}
              />

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-bold uppercase tracking-wider">{st.stage}</span>
                <span className="font-mono text-white text-xs">{st.conversion}</span>
              </div>

              <div>
                <div className="text-2xl font-black text-white">{st.count}</div>
                <div className="text-xs font-semibold text-slate-300 line-clamp-1">
                  {st.name}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-1">
                <div className="flex items-center space-x-1 text-[10px] text-indigo-300 font-medium">
                  <GraduationCap className="w-3 h-3 text-indigo-400" />
                  <span>{st.nepCredits}</span>
                </div>
                <div className="text-[10px] text-slate-400 line-clamp-1">{st.gate}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Horizontal Bar Visualizer */}
        <div className="h-44 w-full">
          {!isMounted ? (
            <div className="h-full w-full rounded-xl bg-slate-950/60 animate-pulse flex items-center justify-center text-xs text-slate-500">
              Initializing funnel metrics...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis type="number" stroke="#64748b" fontSize={10} hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={130}
                />
                <Tooltip
                  cursor={{ fill: "rgba(51, 65, 85, 0.25)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const item = payload[0];
                    return (
                      <div className="bg-slate-950 border border-slate-700 rounded-lg p-2.5 shadow-xl text-xs">
                        <div className="font-bold text-white">{item.payload.name}</div>
                        <div className="text-slate-300 mt-1">
                          Count: <b className="text-white">{item.value}</b> (
                          {item.payload.conversion} of intake)
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={22}>
                  {chartData.map((entry, index) => (
                    <Cell key={`funnel-cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Footer Summary */}
      <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
          <span>Stage-gate progression requires both Academic & External signatures</span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          NEP 2020 Experiential Learning Rule Active
        </div>
      </div>
    </div>
  );
}
