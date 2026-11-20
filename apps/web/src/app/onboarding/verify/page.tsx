"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ShieldAlert,
  Building2,
  Briefcase,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ExternalLink,
  Award,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";

interface VerificationResponse {
  verified: boolean;
  status: string;
  source: string;
  isOfficialLiveApi: boolean;
  badge: string;
  verifiedAt: string;
  message: string;
  details?: Record<string, unknown>;
}

export default function OnboardingVerifyPage() {
  const [activeTab, setActiveTab] = useState<"aishe" | "industry">("aishe");
  const [aisheCode, setAisheCode] = useState("");
  const [industryIdentifierType, setIndustryIdentifierType] = useState<"cin" | "udyam">("cin");
  const [industryIdentifier, setIndustryIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVerifyAishe = async (codeToVerify?: string) => {
    const targetCode = codeToVerify || aisheCode;
    if (!targetCode) return;

    setIsLoading(true);
    setResult(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/v1/verify/aishe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aisheCode: targetCode }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setResult(json.data);
      } else {
        setResult(json.error?.details || {
          verified: false,
          status: json.error?.code || "REJECTED",
          source: "CONTROLLED_MOCK_MVP",
          isOfficialLiveApi: false,
          badge: "Controlled Mock (MVP)",
          verifiedAt: new Date().toISOString(),
          message: json.error?.message || "Verification failed",
        });
      }
    } catch {
      setErrorMessage("Network error while connecting to verification provider.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyIndustry = async (idToVerify?: string, type?: "cin" | "udyam") => {
    const targetType = type || industryIdentifierType;
    const targetVal = idToVerify || industryIdentifier;
    if (!targetVal) return;

    setIsLoading(true);
    setResult(null);
    setErrorMessage(null);

    const payload = targetType === "cin" ? { cin: targetVal } : { udyamNumber: targetVal };

    try {
      const res = await fetch("/api/v1/verify/industry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setResult(json.data);
      } else {
        setResult(json.error?.details || {
          verified: false,
          status: json.error?.code || "REJECTED",
          source: "CONTROLLED_MOCK_MVP",
          isOfficialLiveApi: false,
          badge: "Controlled Mock (MVP)",
          verifiedAt: new Date().toISOString(),
          message: json.error?.message || "Verification failed",
        });
      }
    } catch {
      setErrorMessage("Network error while connecting to verification provider.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto py-6">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Verification Trust Layer</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Institutional & Enterprise Onboarding
          </h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Verify Higher Education Institutions against the AISHE database or authenticate Industry / MSME
            partners via MCA CIN and Udyam registry records to unlock challenge claiming and stage transitions.
          </p>
        </div>

        {/* Controlled Mock Provenance Banner */}
        <div className="mb-8 p-4 rounded-xl bg-slate-900 border border-blue-500/30 flex items-start space-x-3.5 shadow-lg">
          <Award className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 leading-relaxed">
            <div className="flex items-center space-x-2 mb-1">
              <span className="font-bold text-white">Trust Architecture Policy Notice:</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-mono">
                Controlled Mock (MVP)
              </span>
            </div>
            This environment runs against a certified, deterministic mock provider mirroring the official AISHE, MCA, and Udyam schema contracts. Live government API gateway integration is scheduled for production phase deployment.
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex space-x-2 border-b border-slate-800 pb-3 mb-6" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "aishe"}
            onClick={() => {
              setActiveTab("aishe");
              setResult(null);
            }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              activeTab === "aishe"
                ? "bg-blue-600 text-white shadow"
                : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Higher Education Institution (AISHE)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "industry"}
            onClick={() => {
              setActiveTab("industry");
              setResult(null);
            }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              activeTab === "industry"
                ? "bg-blue-600 text-white shadow"
                : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Industry / MSME Partner (MCA / Udyam)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Input & Form Column */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
              {activeTab === "aishe" ? (
                <div>
                  <h2 className="text-base font-bold text-white mb-1">Verify University or College AISHE Code</h2>
                  <p className="text-xs text-slate-400 mb-4">
                    Enter standard AISHE format (e.g. <code className="text-blue-400">U-0205</code>, <code className="text-blue-400">U-0202</code>, or <code className="text-blue-400">C-44102</code>).
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="aisheCode" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        AISHE Code
                      </label>
                      <input
                        id="aisheCode"
                        type="text"
                        value={aisheCode}
                        onChange={(e) => setAisheCode(e.target.value)}
                        placeholder="e.g. U-0205"
                        className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-mono"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={isLoading || !aisheCode.trim()}
                      onClick={() => handleVerifyAishe()}
                      className="w-full flex items-center justify-center py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {isLoading ? "Running Verification..." : "Run AISHE Verification"}
                    </button>
                  </div>

                  {/* Evaluator Preset Buttons */}
                  <div className="mt-6 pt-4 border-t border-slate-800">
                    <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      SIH Evaluator Quick Presets:
                    </span>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setAisheCode("U-0205");
                          handleVerifyAishe("U-0205");
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 font-mono"
                      >
                        NIT Jamshedpur (U-0205)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAisheCode("U-0202");
                          handleVerifyAishe("U-0202");
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 font-mono"
                      >
                        BIT Mesra (U-0202)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAisheCode("C-44102");
                          handleVerifyAishe("C-44102");
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 font-mono"
                      >
                        BIT Sindri (C-44102)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAisheCode("U-FAKE-999");
                          handleVerifyAishe("U-FAKE-999");
                        }}
                        className="px-2.5 py-1 rounded bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 font-mono"
                      >
                        Negative Test (U-FAKE-999)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="text-base font-bold text-white mb-1">Verify Industry Partner or MSME Entity</h2>
                  <p className="text-xs text-slate-400 mb-4">
                    Verify via Corporate CIN (<code className="text-blue-400">U85100JH...</code>) or Udyam MSME Number (<code className="text-blue-400">UDYAM-JH-...</code>).
                  </p>

                  <div className="space-y-4">
                    <div className="flex space-x-4">
                      <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="idType"
                          checked={industryIdentifierType === "cin"}
                          onChange={() => setIndustryIdentifierType("cin")}
                          className="text-blue-600 focus:ring-blue-500 bg-slate-950 border-slate-800"
                        />
                        <span>Corporate Identification Number (CIN)</span>
                      </label>
                      <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="idType"
                          checked={industryIdentifierType === "udyam"}
                          onChange={() => setIndustryIdentifierType("udyam")}
                          className="text-blue-600 focus:ring-blue-500 bg-slate-950 border-slate-800"
                        />
                        <span>Udyam MSME Certificate</span>
                      </label>
                    </div>

                    <div>
                      <label htmlFor="industryId" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        {industryIdentifierType === "cin" ? "MCA CIN (21 characters)" : "Udyam Registration Number"}
                      </label>
                      <input
                        id="industryId"
                        type="text"
                        value={industryIdentifier}
                        onChange={(e) => setIndustryIdentifier(e.target.value)}
                        placeholder={industryIdentifierType === "cin" ? "e.g. U85100JH2016NPL008638" : "e.g. UDYAM-JH-01-0012345"}
                        className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-mono"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={isLoading || !industryIdentifier.trim()}
                      onClick={() => handleVerifyIndustry()}
                      className="w-full flex items-center justify-center py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {isLoading ? "Running Verification..." : "Run Enterprise Verification"}
                    </button>
                  </div>

                  {/* Evaluator Presets for Industry */}
                  <div className="mt-6 pt-4 border-t border-slate-800">
                    <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      SIH Evaluator Quick Presets:
                    </span>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setIndustryIdentifierType("cin");
                          setIndustryIdentifier("U85100JH2016NPL008638");
                          handleVerifyIndustry("U85100JH2016NPL008638", "cin");
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 font-mono"
                      >
                        Tata Steel Foundation (CIN)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIndustryIdentifierType("udyam");
                          setIndustryIdentifier("UDYAM-JH-01-0012345");
                          handleVerifyIndustry("UDYAM-JH-01-0012345", "udyam");
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 font-mono"
                      >
                        Ranchi Precision (Udyam)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIndustryIdentifierType("udyam");
                          setIndustryIdentifier("UDYAM-XX-99-9999999");
                          handleVerifyIndustry("UDYAM-XX-99-9999999", "udyam");
                        }}
                        className="px-2.5 py-1 rounded bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 font-mono"
                      >
                        Negative Udyam (Rejected)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Results Display Column */}
          <div className="lg:col-span-5">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl h-full flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center space-x-2">
                  <span>Trust Verification Record</span>
                </h3>

                {errorMessage && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {result ? (
                  <div className="space-y-4">
                    {/* Status Header Badge */}
                    <div
                      className={`p-3.5 rounded-xl border flex items-center space-x-3 ${
                        result.verified
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : "bg-red-500/10 border-red-500/30 text-red-300"
                      }`}
                    >
                      {result.verified ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
                      )}
                      <div>
                        <div className="font-bold text-sm">
                          {result.verified ? "Verification Confirmed" : `Verification ${result.status}`}
                        </div>
                        <div className="text-xs opacity-90">{result.message}</div>
                      </div>
                    </div>

                    {/* Metadata Card */}
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Provenance Badge:</span>
                        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold text-[10px]">
                          {result.badge}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Provider Source:</span>
                        <span className="font-mono text-slate-200">{result.source}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Official Live API:</span>
                        <span className="text-slate-300">
                          {result.isOfficialLiveApi ? "True (Live Government Gateway)" : "False (Controlled Mock MVP)"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Timestamp:</span>
                        <span className="font-mono text-slate-300 text-[11px]">{new Date(result.verifiedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    {/* Entity Details Card */}
                    {result.details && (
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 text-xs space-y-2">
                        <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1">
                          Registry Payload Records
                        </div>
                        {Object.entries(result.details).map(([key, val]) => (
                          <div key={key} className="flex justify-between items-start text-[11px]">
                            <span className="text-slate-400 capitalize">{key.replace(/([A-Z])/g, " $1")}:</span>
                            <span className="text-slate-200 text-right font-medium ml-2">{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500 text-xs">
                    <ShieldAlert className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
                    <span>No verification query submitted yet. Enter an AISHE code or MCA/Udyam number to inspect the trust record.</span>
                  </div>
                )}
              </div>

              {/* Action Button */}
              {result?.verified && (
                <div className="mt-6 pt-4 border-t border-slate-800">
                  <Link
                    href="/dashboard"
                    className="w-full inline-flex items-center justify-center py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition shadow"
                  >
                    <span>Organization Activated — Go to Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
