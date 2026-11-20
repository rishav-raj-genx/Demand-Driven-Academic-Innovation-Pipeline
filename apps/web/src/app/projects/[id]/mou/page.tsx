"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  Printer,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Building2,
  Briefcase,
  AlertCircle,
  Loader2,
  FileText,
  Stamp,
  Award,
} from "lucide-react";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface MouRecord {
  id: string;
  mouNumber: string;
  documentUrl: string;
  status: "DRAFT" | "HEI_ACKNOWLEDGED" | "INDUSTRY_ACKNOWLEDGED" | "MUTUALLY_ACKNOWLEDGED";
  ipTerms?: string | null;
  pledgedAmountInr?: string | number | null;
  ipOwnershipSplit?: {
    heiPercentage: number;
    industryPercentage: number;
  } | null;
  milestoneSchedule?: Array<{
    phase: string;
    deliverable: string;
    trancheAmountInr?: number;
    targetMonth?: number;
  }> | null;
  complianceClause?: string | null;
  signedDate?: string | null;
  heiAcknowledgedAt?: string | null;
  heiAcknowledgedBy?: string | null;
  industryAcknowledgedAt?: string | null;
  industryAcknowledgedBy?: string | null;
  expiryDate?: string | null;
  createdAt: string;
}

interface ProjectData {
  id: string;
  title: string;
  description: string;
  currentPhase: string;
  budget?: string | number | null;
  fundingStatus?: string | null;
  createdAt: string;
  institution: {
    id: string;
    name: string;
    code: string;
    tier: string;
    address?: string | null;
    district?: { name: string; state: string } | null;
  };
  industryPartner?: {
    id: string;
    organizationName: string;
    cin?: string | null;
    industrySector?: string | null;
    verificationStatus: string;
  } | null;
  challenge?: {
    id: string;
    title: string;
    problemStatement: string;
  } | null;
  mous?: MouRecord[];
}

export default function FormalPrintableMouPage({ params }: RouteParams) {
  const { id: projectId } = use(params);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [mou, setMou] = useState<MouRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [ackSuccess, setAckSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const projRes = await fetch(`/api/v1/projects/${projectId}`);
      if (!projRes.ok) {
        throw new Error(`Failed to load project details (HTTP ${projRes.status})`);
      }
      const projJson = await projRes.json();
      const proj: ProjectData = projJson.data;
      setProject(proj);

      const mouRes = await fetch(`/api/v1/projects/${projectId}/mou`);
      if (mouRes.ok) {
        const mouJson = await mouRes.json();
        const mousList: MouRecord[] = Array.isArray(mouJson.data) ? mouJson.data : [];
        if (mousList.length > 0) {
          setMou(mousList[0]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading MoU agreement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleAcknowledge = async () => {
    if (!mou) return;
    setIsAcknowledging(true);
    setAckSuccess(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/mou/${mou.id}/acknowledge`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to acknowledge MoU");
      }
      setAckSuccess(json.message);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Acknowledgment failed");
    } finally {
      setIsAcknowledging(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-3" />
        <p className="text-sm text-slate-600 font-medium">Generating official MoU legal document...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-slate-100 p-8 flex flex-col items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm p-6 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Unable to Load MoU Document</h2>
          <p className="text-sm text-slate-600">{error || "Project not found"}</p>
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Project Workspace
          </Link>
        </div>
      </div>
    );
  }

  const ipSplit = mou?.ipOwnershipSplit || { heiPercentage: 70, industryPercentage: 30 };
  const schedule = mou?.milestoneSchedule || [
    { phase: "POC", deliverable: "Proof of Concept Hardware Firmware", trancheAmountInr: 200000, targetMonth: 2 },
    { phase: "PROTOTYPING", deliverable: "Working Beta Prototype & Benchmarks", trancheAmountInr: 300000, targetMonth: 4 },
  ];
  const pledgedInr = mou?.pledgedAmountInr ? Number(mou.pledgedAmountInr) : 500000;
  const isMutuallyAck = mou?.status === "MUTUALLY_ACKNOWLEDGED";

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      {/* Top Floating Control Bar - Hidden when printing */}
      <div className="max-w-4xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${project.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Project
          </Link>
          <div className="h-4 w-px bg-slate-200" />
          <span className="text-xs font-semibold text-slate-700">
            {mou ? `MoU Ref: ${mou.mouNumber}` : "Drafting Bilateral Agreement"}
          </span>
          {isMutuallyAck ? (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Mutually Executed
            </span>
          ) : (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Pending Signatures
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!isMutuallyAck && mou && (
            <button
              onClick={handleAcknowledge}
              disabled={isAcknowledging}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-sm"
            >
              <Stamp className="w-3.5 h-3.5" />
              {isAcknowledging ? "Signing..." : "Acknowledge & Sign MoU"}
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {ackSuccess && (
        <div className="max-w-4xl mx-auto mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800 text-center print:hidden">
          {ackSuccess}
        </div>
      )}

      {/* Official Formal Printable Document Layout */}
      <div className="max-w-4xl mx-auto bg-white p-10 sm:p-14 rounded-2xl shadow-md border border-slate-200 print:border-none print:shadow-none print:p-0 print:max-w-full text-slate-900 font-serif leading-relaxed">
        {/* National Header & Emblem Layout */}
        <div className="text-center border-b-2 border-slate-900 pb-6 mb-8">
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 rounded-full border-2 border-slate-800 flex items-center justify-center font-bold text-xs tracking-wider text-slate-800 uppercase">
              GOI
            </div>
          </div>
          <h4 className="text-xs font-bold tracking-widest text-slate-600 uppercase font-sans">
            Government of India • Ministry of Education • AICTE
          </h4>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-wide mt-1 uppercase font-sans">
            Memorandum of Understanding (MoU)
          </h2>
          <p className="text-xs text-slate-600 mt-1 font-sans">
            For Demand-Driven Academic Research, Experiential Learning & CSR Innovation Collaboration
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs font-sans text-slate-700">
            <span>
              <strong>MoU Registration No:</strong> {mou?.mouNumber || "MOU-SIH26-PROVISIONAL"}
            </span>
            <span>•</span>
            <span>
              <strong>Date:</strong> {mou?.signedDate ? new Date(mou.signedDate).toLocaleDateString("en-IN", { dateStyle: "long" }) : new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
            </span>
            <span>•</span>
            <span>
              <strong>Execution Framework:</strong> NEP 2020 & CSR Section 135
            </span>
          </div>
        </div>

        {/* The Parties Preamble */}
        <div className="space-y-6 text-sm">
          <p className="text-justify indent-8">
            This Memorandum of Understanding (hereinafter referred to as the <strong>&ldquo;MoU&rdquo;</strong>) is entered into on this{" "}
            <strong>{new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}</strong>, by and between:
          </p>

          {/* First Party (Academic Institution) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1 font-sans">
            <p className="font-bold text-slate-900 text-base">
              1. {project.institution.name} (First Party)
            </p>
            <p className="text-xs text-slate-600">
              <strong>AISHE Code:</strong> {project.institution.code} | <strong>Institutional Tier:</strong> {project.institution.tier.replace("_", " ")}
            </p>
            <p className="text-xs text-slate-600">
              <strong>Campus Location:</strong> {project.institution.address || "Main Campus"}, {project.institution.district?.name || "Jharkhand"}, {project.institution.district?.state || "India"}
            </p>
            <p className="text-xs text-slate-600 italic">
              Represented by Authorized Leadership (Dean R&D / Principal / Lead Faculty Investigator).
            </p>
          </div>

          <p className="text-center font-bold text-xs uppercase tracking-widest text-slate-500 font-sans">
            — AND —
          </p>

          {/* Second Party (Industry / CSR Partner) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1 font-sans">
            <p className="font-bold text-slate-900 text-base">
              2. {project.industryPartner?.organizationName || "Corporate / CSR Partner"} (Second Party)
            </p>
            <p className="text-xs text-slate-600">
              <strong>Corporate Identification Number (CIN):</strong> {project.industryPartner?.cin || "Corporate MSME / CSR Partner"}
            </p>
            <p className="text-xs text-slate-600">
              <strong>Industry Sector:</strong> {project.industryPartner?.industrySector || "Technology & Engineering Services"} | <strong>Status:</strong> MCA / Platform Verified
            </p>
            <p className="text-xs text-slate-600 italic">
              Represented by Authorized Signatory (CSR Head / Managing Director / R&D Director).
            </p>
          </div>

          <p className="text-justify indent-8">
            WHEREAS, the First Party is an accredited institution of higher education dedicated to research, engineering development, and youth technical training aligned with the National Education Policy (NEP 2020); and
          </p>
          <p className="text-justify indent-8">
            WHEREAS, the Second Party possesses deep domain expertise, civic/industrial problem challenges, and statutory Corporate Social Responsibility (CSR) commitments to support impactful technological solutions;
          </p>
          <p className="text-justify font-bold indent-8">
            NOW, THEREFORE, the Parties mutually covenant and agree to the following collaborative terms:
          </p>

          {/* Section 1: Objective & Project Scope */}
          <div className="space-y-2 pt-2">
            <h3 className="font-bold text-base text-slate-900 border-b border-slate-300 pb-1 font-sans">
              1. Purpose & Scope of Collaborative Project
            </h3>
            <p className="text-justify text-xs sm:text-sm">
              The Parties jointly agree to advance research and development for project entitled:{" "}
              <strong>&ldquo;{project.title}&rdquo;</strong> (Project ID: <code>{project.id}</code>).
            </p>
            {project.challenge && (
              <p className="text-justify text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200">
                <strong>Underlying Problem Statement:</strong> {project.challenge.problemStatement}
              </p>
            )}
            <p className="text-justify text-xs sm:text-sm">
              The collaboration will progress sequentially across the four prescribed stages of the Demand-Driven Academic Innovation Pipeline: <strong>(1) Proof of Concept (PoC)</strong>, <strong>(2) Prototyping</strong>, <strong>(3) Field Testing</strong>, and <strong>(4) Intellectual Property & Tech Transfer</strong>.
            </p>
          </div>

          {/* Section 2: Intellectual Property Rights Allocation */}
          <div className="space-y-2 pt-2">
            <h3 className="font-bold text-base text-slate-900 border-b border-slate-300 pb-1 font-sans">
              2. Intellectual Property (IP) Ownership Split
            </h3>
            <p className="text-justify text-xs sm:text-sm">
              Any inventions, patents, software algorithms, or registered designs arising directly from work executed under this pipeline shall be jointly held according to the following agreed allocation:
            </p>
            <div className="grid grid-cols-2 gap-4 my-2 font-sans">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                <span className="text-xs text-indigo-700 font-semibold block uppercase">
                  Higher Education Institution (HEI)
                </span>
                <span className="text-2xl font-black text-indigo-950">
                  {ipSplit.heiPercentage}%
                </span>
                <span className="text-[11px] text-indigo-600 block mt-0.5">
                  Academic & Student Inventor Share
                </span>
              </div>
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-center">
                <span className="text-xs text-purple-700 font-semibold block uppercase">
                  Industry / CSR Partner
                </span>
                <span className="text-2xl font-black text-purple-950">
                  {ipSplit.industryPercentage}%
                </span>
                <span className="text-[11px] text-purple-600 block mt-0.5">
                  Commercialization & Production Rights
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Deliverable & Tranche Schedule */}
          <div className="space-y-2 pt-2">
            <h3 className="font-bold text-base text-slate-900 border-b border-slate-300 pb-1 font-sans">
              3. Milestone Deliverables & External CSR Funding Schedule
            </h3>
            <p className="text-justify text-xs sm:text-sm">
              The Second Party pledges total external grant sponsorship of{" "}
              <strong>₹{pledgedInr.toLocaleString("en-IN")}</strong> to be disbursed in stage-gated tranches upon verified dual-signature milestone completion:
            </p>
            <div className="overflow-x-auto my-2 font-sans">
              <table className="min-w-full divide-y divide-slate-200 border border-slate-200 text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase">
                  <tr>
                    <th className="px-3 py-2 border-r border-slate-200">Phase</th>
                    <th className="px-3 py-2 border-r border-slate-200">Milestone Deliverable</th>
                    <th className="px-3 py-2 border-r border-slate-200">Target Month</th>
                    <th className="px-3 py-2 text-right">Tranche Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {schedule.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-900 border-r border-slate-200">
                        {item.phase}
                      </td>
                      <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                        {item.deliverable}
                      </td>
                      <td className="px-3 py-2 text-slate-600 border-r border-slate-200">
                        Month {item.targetMonth || idx * 2 + 1}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                        ₹{(item.trancheAmountInr || 250000).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Mandatory Statutory Compliance Clause */}
          <div className="space-y-2 pt-2">
            <h3 className="font-bold text-base text-slate-900 border-b border-slate-300 pb-1 font-sans flex items-center gap-1.5 text-amber-800">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              4. Mandatory Statutory Non-Custodial Compliance Clause
            </h3>
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg text-xs leading-relaxed text-amber-950 font-sans text-justify">
              <p className="font-bold mb-1">
                EXPRESS LEGAL STIPULATION ON OFF-PLATFORM FINANCIAL DISBURSEMENTS:
              </p>
              <p>
                {mou?.complianceClause ||
                  "All CSR disbursements occur exclusively via external banking channels outside the platform. The platform does not process, hold, or escrow funds. Financial execution must be conducted directly between the Industry/CSR Partner and the Higher Education Institution through official banking channels (NEFT/RTGS/Cheque/Direct CSR Grant)."}
              </p>
            </div>
          </div>

          {/* Section 5: Bilateral Signatory Seals & Stamps */}
          <div className="pt-6 border-t-2 border-slate-800 space-y-4">
            <h3 className="font-bold text-center text-sm uppercase tracking-widest text-slate-800 font-sans">
              Bilateral Digital Execution & Acknowledgment Stamps
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 font-sans">
              {/* Academic HEI Stamp Box */}
              <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl relative space-y-2 bg-slate-50/50">
                <span className="text-[11px] font-bold text-slate-500 uppercase block tracking-wider">
                  For & on behalf of Academic HEI
                </span>
                <p className="font-bold text-slate-900 text-sm">{project.institution.name}</p>
                <p className="text-xs text-slate-600">AISHE: {project.institution.code}</p>

                {mou?.heiAcknowledgedAt ? (
                  <div className="pt-3 border-t border-slate-200 space-y-1">
                    <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Digitally Acknowledged & Sealed
                    </div>
                    <p className="text-[11px] text-slate-500">
                      <strong>Timestamp:</strong>{" "}
                      {new Date(mou.heiAcknowledgedAt).toLocaleString("en-IN")}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      Signer UUID: {mou.heiAcknowledgedBy || "Academic Authority"}
                    </p>
                  </div>
                ) : (
                  <div className="pt-4 border-t border-slate-200 text-center">
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                      Pending Academic Track Acknowledgment
                    </span>
                  </div>
                )}
              </div>

              {/* Industry Partner Stamp Box */}
              <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl relative space-y-2 bg-slate-50/50">
                <span className="text-[11px] font-bold text-slate-500 uppercase block tracking-wider">
                  For & on behalf of Industry / CSR Partner
                </span>
                <p className="font-bold text-slate-900 text-sm">
                  {project.industryPartner?.organizationName || "Corporate / CSR Partner"}
                </p>
                <p className="text-xs text-slate-600">
                  CIN: {project.industryPartner?.cin || "Corporate MSME Entity"}
                </p>

                {mou?.industryAcknowledgedAt ? (
                  <div className="pt-3 border-t border-slate-200 space-y-1">
                    <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Digitally Acknowledged & Sealed
                    </div>
                    <p className="text-[11px] text-slate-500">
                      <strong>Timestamp:</strong>{" "}
                      {new Date(mou.industryAcknowledgedAt).toLocaleString("en-IN")}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      Signer UUID: {mou.industryAcknowledgedBy || "Corporate Representative"}
                    </p>
                  </div>
                ) : (
                  <div className="pt-4 border-t border-slate-200 text-center">
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                      Pending Industry Track Acknowledgment
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Official Mutual Certification Seal */}
            {isMutuallyAck && (
              <div className="p-3 bg-emerald-50 border-2 border-emerald-500 rounded-xl text-center space-y-1 font-sans mt-4">
                <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-900 uppercase tracking-widest">
                  <Award className="w-4 h-4 text-emerald-600" />
                  Mutually Executed & Legally Verified
                </div>
                <p className="text-[11px] text-emerald-800 max-w-xl mx-auto">
                  This document constitutes a binding bilateral research and CSR innovation collaboration agreement recorded under the platform audit ledger. Off-platform financial disbursements are governed by bilateral banking channels under Section 135 of the Companies Act 2013.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
