"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Sliders,
  ArrowLeft,
  Plus,
  X,
  Save,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Cpu,
  FlaskConical,
  GraduationCap,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { AppShell, type ShellUser } from "@/components/AppShell";

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
  activeProjects: number;
  maxCapacity: number;
  utilizationRatio: number;
  domains: string[];
  facultySpecializations: string[];
  labFacilities: string[];
  profileSummary?: string | null;
}

export default function HeiProfilePage() {
  const [user, setUser] = useState<ShellUser | null>(null);
  const [institutionId, setInstitutionId] = useState<string>("");
  const [institution, setInstitution] = useState<InstitutionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");

  const [facultySpecializations, setFacultySpecializations] = useState<string[]>([]);
  const [facultyInput, setFacultyInput] = useState("");

  const [labFacilities, setLabFacilities] = useState<string[]>([]);
  const [labInput, setLabInput] = useState("");

  const [profileSummary, setProfileSummary] = useState("");
  const [maxCapacity, setMaxCapacity] = useState(10);

  // Toast / Status state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Initial Load: Authenticate and resolve institution ID
  useEffect(() => {
    async function init() {
      try {
        const meRes = await fetch("/api/v1/auth/me").then((r) => (r.ok ? r.json() : null));
        if (meRes?.success && meRes?.data?.user) {
          setUser(meRes.data.user);
        }

        let targetId = meRes?.data?.user?.institutionId;
        if (!targetId) {
          // If super admin or visitor without binding, fallback to first institution
          const instListRes = await fetch("/api/v1/institutions?limit=1").then((r) =>
            r.ok ? r.json() : null
          );
          targetId = instListRes?.data?.[0]?.id || "";
        }

        if (targetId) {
          setInstitutionId(targetId);
        }
      } catch (err) {
        console.error("Failed to load user session", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // 2. Fetch institution details
  useEffect(() => {
    if (!institutionId) return;

    fetch(`/api/v1/institutions/${institutionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json?.data) {
          const inst = json.data as InstitutionProfile;
          setInstitution(inst);
          setDomains(inst.domains || []);
          setFacultySpecializations(inst.facultySpecializations || []);
          setLabFacilities(inst.labFacilities || []);
          setProfileSummary(inst.profileSummary || "");
          setMaxCapacity(inst.maxCapacity || 10);
        }
      })
      .catch((err) => console.error("Error fetching institution profile", err));
  }, [institutionId]);

  // Tag helper handlers
  function addTag(
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    input: string,
    setInput: React.Dispatch<React.SetStateAction<string>>
  ) {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!list.includes(trimmed)) {
      setList([...list, trimmed]);
    }
    setInput("");
  }

  function removeTag(
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    tagToRemove: string
  ) {
    setList(list.filter((tag) => tag !== tagToRemove));
  }

  // Handle Form Submission
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!institutionId) return;

    setSaving(true);
    setToastMessage(null);
    setErrorMessage(null);

    try {
      const payload = {
        domains,
        facultySpecializations,
        labFacilities,
        profileSummary: profileSummary.trim() || null,
        maxCapacity,
      };

      const res = await fetch(`/api/v1/institutions/${institutionId}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || "Failed to update profile");
      }

      // Update local state
      if (institution) {
        setInstitution({
          ...institution,
          domains,
          facultySpecializations,
          labFacilities,
          profileSummary,
          maxCapacity,
          utilizationRatio: Number((institution.activeProjects / maxCapacity).toFixed(2)),
        });
      }

      setToastMessage(
        "Institutional capability profile saved! Background re-embedding job queued in BullMQ (hei.embed) with 384-dimensional pgvector update."
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An error occurred while updating profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell initialUser={user}>
      <div className="py-6 space-y-8 max-w-5xl mx-auto">
        {/* Header with Navigation Link */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
              <Link
                href="/hei/dashboard"
                className="hover:underline flex items-center space-x-1 text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to HEI Dashboard</span>
              </Link>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center space-x-2">
              <Sliders className="w-6 h-6 text-blue-400" />
              <span>Institutional Capability & Resource Editor</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage specialized research domains, laboratory equipment, faculty capacity limits, and vector metadata.
            </p>
          </div>

          {institution && (
            <div className="flex items-center space-x-3 bg-slate-900 border border-slate-800 rounded-xl p-3">
              <div className="text-right">
                <div className="text-xs font-bold text-white">{institution.name}</div>
                <div className="text-[11px] text-blue-400">AISHE: {institution.code} • {institution.tier}</div>
              </div>
            </div>
          )}
        </div>

        {/* Real-time Toast Confirmation Banner */}
        {toastMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-start space-x-3 text-emerald-300 shadow-xl animate-in fade-in slide-in-from-top duration-300">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="font-bold text-emerald-400 text-sm">Profile Synchronized & Re-Embedding Queued</div>
              <p className="leading-relaxed">{toastMessage}</p>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start space-x-3 text-red-300 shadow-xl">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-bold text-red-400 text-sm">Failed to Update Profile</div>
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400 mb-2" />
            <p className="text-sm">Loading capability configuration...</p>
          </div>
        )}

        {!loading && (
          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* 1. Capability Domains */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center space-x-2 text-white font-bold">
                <Cpu className="w-5 h-5 text-blue-400" />
                <h2 className="text-base">Institutional Capability Domains</h2>
              </div>
              <p className="text-xs text-slate-400">
                Discipline tags used by the AI embedding engine to map citizen challenges to your institution.
              </p>

              {/* Tag Badges List */}
              <div className="flex flex-wrap gap-2 min-h-10 p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                {domains.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeTag(domains, setDomains, tag)}
                      className="hover:text-red-400 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                {domains.length === 0 && (
                  <span className="text-xs text-slate-500 italic p-1">No domains specified. Add at least one domain.</span>
                )}
              </div>

              {/* Add Tag Input */}
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(domains, setDomains, domainInput, setDomainInput);
                    }
                  }}
                  placeholder="e.g. Metallurgical Engineering, Clean Energy, IoT, Mining Tech"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => addTag(domains, setDomains, domainInput, setDomainInput)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition flex items-center space-x-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Tag</span>
                </button>
              </div>
            </div>

            {/* 2. Faculty Specializations */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center space-x-2 text-white font-bold">
                <GraduationCap className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base">Faculty Research & Technical Specializations</h2>
              </div>
              <p className="text-xs text-slate-400">
                Departmental competencies, faculty research topics, and specialized advisory fields.
              </p>

              {/* Tag Badges List */}
              <div className="flex flex-wrap gap-2 min-h-10 p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                {facultySpecializations.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeTag(facultySpecializations, setFacultySpecializations, tag)}
                      className="hover:text-red-400 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                {facultySpecializations.length === 0 && (
                  <span className="text-xs text-slate-500 italic p-1">No faculty specializations listed.</span>
                )}
              </div>

              {/* Add Tag Input */}
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={facultyInput}
                  onChange={(e) => setFacultyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(facultySpecializations, setFacultySpecializations, facultyInput, setFacultyInput);
                    }
                  }}
                  placeholder="e.g. Blast Furnace Modeling, Bio-Remediation, Solar Inverters"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() =>
                    addTag(facultySpecializations, setFacultySpecializations, facultyInput, setFacultyInput)
                  }
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition flex items-center space-x-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Faculty Focus</span>
                </button>
              </div>
            </div>

            {/* 3. Laboratory Facilities */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center space-x-2 text-white font-bold">
                <FlaskConical className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base">Laboratory & Testing Infrastructure</h2>
              </div>
              <p className="text-xs text-slate-400">
                Specialized hardware, prototyping facilities, spectrometers, and wet-lab equipment.
              </p>

              {/* Tag Badges List */}
              <div className="flex flex-wrap gap-2 min-h-10 p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                {labFacilities.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeTag(labFacilities, setLabFacilities, tag)}
                      className="hover:text-red-400 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                {labFacilities.length === 0 && (
                  <span className="text-xs text-slate-500 italic p-1">No laboratory equipment specified.</span>
                )}
              </div>

              {/* Add Tag Input */}
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={labInput}
                  onChange={(e) => setLabInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(labFacilities, setLabFacilities, labInput, setLabInput);
                    }
                  }}
                  placeholder="e.g. Metallography Testing Bench, GIS Remote Sensing Lab, Automated CNC Cell"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => addTag(labFacilities, setLabFacilities, labInput, setLabInput)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition flex items-center space-x-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Lab Tool</span>
                </button>
              </div>
            </div>

            {/* 4. Project Capacity Limit & Profile Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Capacity Limit Slider */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center space-x-2 text-white font-bold">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                  <h2 className="text-base">Max Project Capacity</h2>
                </div>
                <p className="text-xs text-slate-400">
                  Maximum simultaneous academic projects your institution can incubate without overload.
                </p>

                <div className="flex items-center justify-between text-2xl font-black text-white">
                  <span>{maxCapacity} Projects</span>
                  <span className="text-xs text-slate-400 font-normal">Range: 1–50</span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="50"
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-500 cursor-pointer"
                />

                <div className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  Active Projects: <strong className="text-white">{institution?.activeProjects ?? 0}</strong>.
                  Utilization will be:{" "}
                  <strong className="text-blue-400">
                    {Math.round(((institution?.activeProjects ?? 0) / maxCapacity) * 100)}%
                  </strong>
                </div>
              </div>

              {/* Profile Summary Textarea */}
              <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-white font-bold">
                    <Sparkles className="w-5 h-5 text-blue-400" />
                    <h2 className="text-base">Institutional Capability Overview</h2>
                  </div>
                  <span className="text-[11px] text-slate-400">{profileSummary.length} / 2000 chars</span>
                </div>
                <p className="text-xs text-slate-400">
                  Natural language description embedded by the AI engine into your institution's 384-dimensional vector.
                </p>

                <textarea
                  rows={4}
                  value={profileSummary}
                  onChange={(e) => setProfileSummary(e.target.value)}
                  maxLength={2000}
                  placeholder="Describe your university or college's research focus, student innovation cells, industry collaborations, and technical strengths..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-4">
              <Link
                href="/hei/dashboard"
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={saving || domains.length === 0}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center space-x-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Triggering BullMQ Re-Embedding...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Profile & Trigger Re-Embedding</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
