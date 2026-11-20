"use client";

import React, { useEffect, useState } from "react";
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
  FileCheck,
} from "lucide-react";
import { AppShell, type ShellUser } from "@/components/AppShell";

export default function DashboardPage() {
  const [user, setUser] = useState<ShellUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json?.data?.user) {
          setUser(json.data.user);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const isVerified =
    user?.orgVerificationStatus === "VERIFIED" ||
    user?.verificationStatus === "VERIFIED" ||
    user?.institution?.verificationStatus === "VERIFIED" ||
    user?.industryPartner?.verificationStatus === "VERIFIED";

  return (
    <AppShell initialUser={user}>
      <div className="py-4 space-y-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
                <Sparkles className="w-4 h-4" />
                <span>Demand-Driven Academic Innovation Pipeline</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Welcome back, {user?.fullName || "Innovator"}
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                {user?.institution?.name || user?.industryPartner?.organizationName || "Government of Jharkhand Academic Pipeline"}
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

        {/* Pipeline System Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Seeded Challenges</span>
              <Compass className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-white">30</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Across 8 Jharkhand districts</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Higher Ed Institutions</span>
              <Building2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-black text-white">10</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Tier 1–3 HEIs & Polytechnics</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Industry Partners</span>
              <Briefcase className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-white">5</div>
            <div className="text-[11px] text-slate-500 mt-0.5">MSME & CSR entities</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Spatial Districts</span>
              <MapPin className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-white">8</div>
            <div className="text-[11px] text-slate-500 mt-0.5">MultiPolygon PostGIS boundaries</div>
          </div>
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
                  Authenticate your university or industrial corporate entity against deterministic AISHE and MCA CIN / Udyam mock registries.
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
                  Explore 30 seeded societal demands from clean drinking water in Palamu to coal mine dust suppression in Dhanbad.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-500 flex items-center space-x-1 cursor-not-allowed">
                  <span>Matchmaking Engine (Phase 3)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
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
                  Monitor dual-signature transition workflows across POC, Prototyping, Field Testing, and IP Tech Transfer.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-500 flex items-center space-x-1 cursor-not-allowed">
                  <span>Dual Approval Gateway (Phase 3)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
