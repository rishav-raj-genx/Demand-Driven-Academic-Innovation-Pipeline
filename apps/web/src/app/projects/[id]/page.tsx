"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  FolderGit2,
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
  Plus,
  Upload,
  FileText,
  Lock,
  Unlock,
  Copy,
  ExternalLink,
  Stamp,
  Users,
  FileCheck,
  X,
  AlertTriangle,
  FileCode,
  ShieldAlert,
} from "lucide-react";
import { AppShell, type ShellUser } from "@/components/AppShell";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface PhaseApprovalItem {
  id: string;
  milestoneId: string;
  signerId: string;
  signerRole: "ACADEMIC_APPROVER" | "EXTERNAL_APPROVER";
  decision: "APPROVED" | "REJECTED";
  remarks?: string | null;
  signedAt: string;
  snapshotHash: string;
  signer: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };
}

interface MilestoneItem {
  id: string;
  title: string;
  description?: string | null;
  summary?: string | null;
  phase: "POC" | "PROTOTYPING" | "FIELD_TEST" | "IP_TECH_TRANSFER";
  orderIndex: number;
  status: "DRAFT" | "SUBMITTED_FOR_APPROVAL" | "APPROVED" | "REJECTED";
  isCompleted: boolean;
  completedAt?: string | null;
  contentHash: string;
  artifactKeys: string[];
  phaseApprovals: PhaseApprovalItem[];
  createdAt: string;
}

interface ProjectMemberItem {
  id: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    phoneNumber?: string | null;
    institutionId?: string | null;
    industryPartnerId?: string | null;
  };
}

interface MouItem {
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
  complianceClause?: string | null;
  signedDate?: string | null;
  heiAcknowledgedAt?: string | null;
  industryAcknowledgedAt?: string | null;
  createdAt: string;
}

interface CsrLedgerEntryItem {
  id: string;
  projectId: string;
  partnerId: string;
  amount: string | number;
  paymentMode?: string | null;
  externalReferenceNo?: string | null;
  receiptKey?: string | null;
  status: "SUBMITTED" | "VERIFIED" | "REJECTED";
  transactionRef?: string | null;
  disbursementDate?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  remarks?: string | null;
  createdAt: string;
  partner?: {
    organizationName: string;
  } | null;
}

interface FullProjectDetail {
  id: string;
  title: string;
  description: string;
  currentPhase: "POC" | "PROTOTYPING" | "FIELD_TEST" | "IP_TECH_TRANSFER";
  budget?: string | number | null;
  fundingStatus: "UNFUNDED" | "CSR_PLEDGED" | "CSR_FUNDED" | "INDUSTRY_FUNDED";
  startDate?: string | null;
  targetCompletionDate?: string | null;
  createdAt: string;
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
  projectMembers: ProjectMemberItem[];
  milestones: MilestoneItem[];
  mous: MouItem[];
  csrLedgerEntries: CsrLedgerEntryItem[];
  nepCreditSummary?: {
    totalCreditsPossible: number;
    earnedCredits: number;
    eligibleCredits: number;
    creditsByPhase: Record<string, { value: number; completed: boolean; inProgress: boolean }>;
  };
}

const PHASE_ORDER = ["POC", "PROTOTYPING", "FIELD_TEST", "IP_TECH_TRANSFER"] as const;

const PHASE_DETAILS: Record<
  (typeof PHASE_ORDER)[number],
  { label: string; stageNumber: number; nepCredits: number; summary: string }
> = {
  POC: {
    label: "Proof of Concept",
    stageNumber: 1,
    nepCredits: 2,
    summary: "Simulations, SPICE models, circuit schematics, or bench experiments.",
  },
  PROTOTYPING: {
    label: "Prototyping",
    stageNumber: 2,
    nepCredits: 4,
    summary: "Working physical or software prototype with benchmark metrics.",
  },
  FIELD_TEST: {
    label: "Field Testing",
    stageNumber: 3,
    nepCredits: 6,
    summary: "Validation in realistic rural/civic or MSME operational environments.",
  },
  IP_TECH_TRANSFER: {
    label: "IP & Tech Transfer",
    stageNumber: 4,
    nepCredits: 8,
    summary: "Commercial licensing, patent filing, and capacity slot release.",
  },
};

export default function ProjectWorkspacePage({ params }: RouteParams) {
  const { id: projectId } = use(params);

  const [project, setProject] = useState<FullProjectDetail | null>(null);
  const [currentUser, setCurrentUser] = useState<ShellUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"milestones" | "csr" | "nep" | "mou">("milestones");

  // Modals state
  const [isSubmitMilestoneOpen, setIsSubmitMilestoneOpen] = useState(false);
  const [isSignTransitionOpen, setIsSignTransitionOpen] = useState(false);
  const [selectedMilestoneToSign, setSelectedMilestoneToSign] = useState<MilestoneItem | null>(null);
  const [isRecordCsrOpen, setIsRecordCsrOpen] = useState(false);

  // Form states
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneSummary, setMilestoneSummary] = useState("");
  const [uploadedArtifactKeys, setUploadedArtifactKeys] = useState<string[]>([]);
  const [uploadingArtifact, setUploadingArtifact] = useState(false);
  const [isSubmittingMilestone, setIsSubmittingMilestone] = useState(false);

  // Sign Transition Form states
  const [signDecision, setSignDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [signRemarks, setSignRemarks] = useState("");
  const [isSubmittingSign, setIsSubmittingSign] = useState(false);

  // CSR Record Form states
  const [csrAmount, setCsrAmount] = useState("");
  const [csrPaymentMode, setCsrPaymentMode] = useState<"EXTERNAL_NEFT" | "RTGS" | "CHEQUE" | "CSR_GRANT">("EXTERNAL_NEFT");
  const [csrRefNo, setCsrRefNo] = useState("");
  const [csrRemarks, setCsrRemarks] = useState("");
  const [csrReceiptKey, setCsrReceiptKey] = useState<string>("");
  const [isSubmittingCsr, setIsSubmittingCsr] = useState(false);

  // Verification state
  const [isVerifyingCsrId, setIsVerifyingCsrId] = useState<string | null>(null);

  // Success notifications
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  // Fetch project and user
  const fetchProjectData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projRes, userRes] = await Promise.all([
        fetch(`/api/v1/projects/${projectId}`),
        fetch("/api/v1/auth/me"),
      ]);

      if (!projRes.ok) {
        throw new Error(`Failed to load project details (HTTP ${projRes.status})`);
      }
      const projJson = await projRes.json();
      setProject(projJson.data);

      if (userRes.ok) {
        const userJson = await userRes.json();
        if (userJson.success && userJson.data?.user) {
          setCurrentUser(userJson.data.user);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading project workspace");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProjectData();
  }, [fetchProjectData]);

  // Handle Artifact File Upload to S3 presigned URL
  const handleArtifactUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingArtifact(true);
    try {
      const presignRes = await fetch("/api/v1/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/pdf",
          fileSizeBytes: file.size,
          purpose: "milestone_artifact",
        }),
      });

      if (!presignRes.ok) {
        const errJson = await presignRes.json();
        throw new Error(errJson.message || "Failed to generate presigned upload URL");
      }

      const { uploadUrl, key } = (await presignRes.json()).data;

      const s3Res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });

      if (!s3Res.ok) {
        throw new Error("Direct S3 upload failed");
      }

      setUploadedArtifactKeys((prev) => [...prev, key]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upload deliverable artifact");
    } finally {
      setUploadingArtifact(false);
    }
  };

  // Submit Milestone Deliverable
  const handleSubmitMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setIsSubmittingMilestone(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: project.currentPhase,
          title: milestoneTitle,
          summary: milestoneSummary,
          artifactKeys: uploadedArtifactKeys,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to submit milestone");
      }

      setBannerNotice("Milestone deliverable submitted successfully! SHA-256 fingerprint generated.");
      setIsSubmitMilestoneOpen(false);
      setMilestoneTitle("");
      setMilestoneSummary("");
      setUploadedArtifactKeys([]);
      await fetchProjectData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Milestone submission failed");
    } finally {
      setIsSubmittingMilestone(false);
    }
  };

  // Submit Dual-Signature Transition
  const handleSubmitSignature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !selectedMilestoneToSign) return;
    setIsSubmittingSign(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/transitions/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestoneId: selectedMilestoneToSign.id,
          decision: signDecision,
          remarks: signRemarks,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to record transition signature");
      }

      setBannerNotice(json.message);
      setIsSignTransitionOpen(false);
      setSignRemarks("");
      setSelectedMilestoneToSign(null);
      await fetchProjectData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Dual-signature signing failed");
    } finally {
      setIsSubmittingSign(false);
    }
  };

  // Record Off-Platform CSR Disbursement
  const handleRecordCsr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setIsSubmittingCsr(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/csr-ledger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountInr: parseFloat(csrAmount),
          paymentMode: csrPaymentMode,
          externalReferenceNo: csrRefNo,
          remarks: csrRemarks,
          receiptKey: csrReceiptKey || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to record CSR ledger entry");
      }

      setBannerNotice("External CSR disbursement tranche recorded successfully! Pending HEI verification.");
      setIsRecordCsrOpen(false);
      setCsrAmount("");
      setCsrRefNo("");
      setCsrRemarks("");
      setCsrReceiptKey("");
      await fetchProjectData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "CSR ledger recording failed");
    } finally {
      setIsSubmittingCsr(false);
    }
  };

  // Verify Off-Platform CSR Tranche
  const handleVerifyCsrEntry = async (entryId: string) => {
    if (!project) return;
    setIsVerifyingCsrId(entryId);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/csr-ledger/${entryId}/verify`, {
        method: "PATCH",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to verify CSR tranche");
      }
      setBannerNotice(json.message);
      await fetchProjectData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setIsVerifyingCsrId(null);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="py-24 text-center">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">Loading collaborative PLM workspace...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !project) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto my-12 p-6 bg-white rounded-xl border border-red-200 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Project Not Found</h2>
          <p className="text-sm text-slate-600">{error || "The requested project ID does not exist."}</p>
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            Back to Projects Directory
          </Link>
        </div>
      </AppShell>
    );
  }

  const currentPhaseIndex = PHASE_ORDER.indexOf(project.currentPhase);
  const activeMilestones = project.milestones.filter((m) => m.phase === project.currentPhase);
  const activeMilestone = activeMilestones[0] || project.milestones[project.milestones.length - 1] || null;

  // Determine user authorization for dual-signature signing
  const isHeiAffiliated =
    currentUser &&
    (currentUser.role === "FACULTY" || currentUser.role === "INSTITUTION_ADMIN" || currentUser.role === "HEI_ADMIN") &&
    currentUser.institutionId === project.institution.id;

  const isIndustryAffiliated =
    currentUser &&
    (currentUser.role === "INDUSTRY_PARTNER" || currentUser.role === "CSR_PARTNER") &&
    currentUser.industryPartnerId === project.industryPartner?.id;

  const isGovtOfficial = currentUser?.role === "GOVT_OFFICIAL";
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const isSignerEligible = isHeiAffiliated || isIndustryAffiliated || isGovtOfficial || isSuperAdmin;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Banner Notice */}
        {bannerNotice && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-sm text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{bannerNotice}</span>
            </div>
            <button onClick={() => setBannerNotice(null)} className="text-emerald-700 hover:text-emerald-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Project Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 text-xs font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {project.currentPhase.replace("_", " ")} Phase Active
                </span>
                {project.fundingStatus === "CSR_FUNDED" && (
                  <span className="px-3 py-1 text-xs font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    CSR Funded
                  </span>
                )}
                {project.fundingStatus === "CSR_PLEDGED" && (
                  <span className="px-3 py-1 text-xs font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    CSR Pledged
                  </span>
                )}
                {project.fundingStatus === "UNFUNDED" && (
                  <span className="px-3 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-600">
                    Unfunded
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {project.title}
              </h1>
              <p className="text-sm text-slate-600 max-w-3xl">
                {project.description || project.challenge?.problemStatement}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/projects/${project.id}/mou`}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition shadow-sm"
              >
                <FileCheck className="w-4 h-4 text-indigo-600" />
                View Formal MoU
              </Link>
              <button
                onClick={() => setIsSubmitMilestoneOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Submit Deliverable
              </button>
            </div>
          </div>

          {/* Stakeholder Details Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6 border-t border-slate-100 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> Academic HEI
              </span>
              <p className="font-bold text-slate-900 truncate">{project.institution.name}</p>
              <p className="text-slate-500">AISHE: {project.institution.code} ({project.institution.tier.replace("_", " ")})</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" /> Industry/CSR Partner
              </span>
              <p className="font-bold text-slate-900 truncate">
                {project.industryPartner?.organizationName || "Awaiting Partner Assignment"}
              </p>
              <p className="text-slate-500">
                {project.industryPartner?.cin ? `CIN: ${project.industryPartner.cin}` : "Pending Linkage"}
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5" /> NEP 2020 Credits
              </span>
              <p className="font-bold text-slate-900">
                {project.nepCreditSummary ? `${project.nepCreditSummary.earnedCredits} / ${project.nepCreditSummary.eligibleCredits} Credits` : "0 Credits Earned"}
              </p>
              <p className="text-slate-500">
                {project.projectMembers.filter((m) => m.role === "STUDENT").length} Student Beneficiaries
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <Banknote className="w-3.5 h-3.5" /> Off-Platform CSR Ledger
              </span>
              <p className="font-bold text-slate-900">
                ₹{project.budget ? Number(project.budget).toLocaleString("en-IN") : "Pledged on MoU"}
              </p>
              <p className="text-slate-500">
                {project.csrLedgerEntries.filter((e) => e.status === "VERIFIED").length} Tranches Verified
              </p>
            </div>
          </div>
        </div>

        {/* 4-PHASE VISUAL PLM STEPPER */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              4-Phase PLM Progression Stepper
            </h2>
            <span className="text-xs font-semibold text-slate-500">
              Governed by Cryptographic Dual-Signature Transitions
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
            {PHASE_ORDER.map((phaseKey, index) => {
              const info = PHASE_DETAILS[phaseKey];
              const isPast = index < currentPhaseIndex;
              const isCurrent = index === currentPhaseIndex;
              const isFuture = index > currentPhaseIndex;

              return (
                <div
                  key={phaseKey}
                  className={`rounded-xl p-5 border transition flex flex-col justify-between ${
                    isPast
                      ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                      : isCurrent
                      ? "bg-indigo-50/80 border-indigo-400 shadow-sm ring-2 ring-indigo-200"
                      : "bg-slate-50 border-slate-200 text-slate-400"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          isPast
                            ? "bg-emerald-600 text-white"
                            : isCurrent
                            ? "bg-indigo-600 text-white ring-2 ring-indigo-300"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {isPast ? "✓" : index + 1}
                      </span>
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          isPast
                            ? "bg-emerald-100 text-emerald-800"
                            : isCurrent
                            ? "bg-indigo-100 text-indigo-800 animate-pulse"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {isPast ? "Completed" : isCurrent ? "Active Stage" : "Locked"}
                      </span>
                    </div>

                    <h3 className={`text-base font-bold ${isCurrent ? "text-indigo-950" : isPast ? "text-emerald-950" : "text-slate-600"}`}>
                      {info.label}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2">{info.summary}</p>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-500 flex items-center gap-1">
                      <GraduationCap className="w-3.5 h-3.5" />
                      +{info.nepCredits} NEP Credits
                    </span>
                    {phaseKey === "IP_TECH_TRANSFER" && (
                      <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-bold">
                        Slot Release
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* LIVE DUAL-SIGNATURE APPROVAL CARD */}
        {activeMilestone && (
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-lg space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-700/60 pb-5">
              <div>
                <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  Phase Gate Approval Engine • {project.currentPhase}
                </span>
                <h3 className="text-xl font-bold mt-2 text-white">
                  {activeMilestone.title}
                </h3>
                <p className="text-xs text-indigo-200 mt-1">
                  {activeMilestone.summary || "Deliverables submitted for dual-signature stage gate verification."}
                </p>
              </div>

              {/* SHA-256 Fingerprint */}
              <div className="bg-indigo-950/80 border border-indigo-700/60 rounded-xl p-3 sm:max-w-xs space-y-1">
                <span className="text-[11px] font-bold text-indigo-400 flex items-center gap-1 uppercase tracking-wider">
                  <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                  SHA-256 Fingerprint
                </span>
                <p className="font-mono text-xs text-indigo-100 truncate">
                  {activeMilestone.contentHash}
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(activeMilestone.contentHash);
                    alert("Content hash copied to clipboard!");
                  }}
                  className="text-[10px] text-indigo-300 hover:text-white flex items-center gap-1 pt-0.5"
                >
                  <Copy className="w-3 h-3" /> Copy Hash
                </button>
              </div>
            </div>

            {/* The 2 Approval Tracks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Track 1: Academic Track */}
              {(() => {
                const academicApproval = activeMilestone.phaseApprovals.find(
                  (a) => a.signerRole === "ACADEMIC_APPROVER"
                );
                return (
                  <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                        Track 1: Academic Track
                      </span>
                      {academicApproval ? (
                        <span className="px-2 py-0.5 text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Signed & Approved
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Awaiting Signature
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white">
                      Verified HEI Faculty Lead / Dean R&D
                    </p>
                    {academicApproval ? (
                      <div className="text-xs text-indigo-200 space-y-1 pt-2 border-t border-white/10">
                        <p><strong>Signer:</strong> {academicApproval.signer.fullName} ({academicApproval.signer.role})</p>
                        <p><strong>Timestamp:</strong> {new Date(academicApproval.signedAt).toLocaleString("en-IN")}</p>
                        {academicApproval.remarks && (
                          <p className="italic text-indigo-100">&ldquo;{academicApproval.remarks}&rdquo;</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-indigo-300/80">
                        Requires authorized HEI lead to inspect PoC benchmarks and affirm academic rigor.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Track 2: External / Industry Track */}
              {(() => {
                const externalApproval = activeMilestone.phaseApprovals.find(
                  (a) => a.signerRole === "EXTERNAL_APPROVER"
                );
                return (
                  <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                        Track 2: External / Industry Track
                      </span>
                      {externalApproval ? (
                        <span className="px-2 py-0.5 text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Signed & Approved
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Awaiting Signature
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white">
                      Verified Industry/CSR Partner OR Govt. Official
                    </p>
                    {externalApproval ? (
                      <div className="text-xs text-indigo-200 space-y-1 pt-2 border-t border-white/10">
                        <p><strong>Signer:</strong> {externalApproval.signer.fullName} ({externalApproval.signer.role})</p>
                        <p><strong>Timestamp:</strong> {new Date(externalApproval.signedAt).toLocaleString("en-IN")}</p>
                        {externalApproval.remarks && (
                          <p className="italic text-indigo-100">&ldquo;{externalApproval.remarks}&rdquo;</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-indigo-300/80">
                        Requires verified Industry CSR mentor or Govt. inspector to review enterprise readiness.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Contextual Signing Button */}
            {isSignerEligible && activeMilestone.status === "SUBMITTED_FOR_APPROVAL" && (
              <div className="pt-4 border-t border-indigo-700/60 flex items-center justify-between">
                <p className="text-xs text-indigo-300">
                  You are recognized as an authorized stakeholder eligible to co-sign this stage gate transition.
                </p>
                <button
                  onClick={() => {
                    setSelectedMilestoneToSign(activeMilestone);
                    setIsSignTransitionOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 rounded-xl transition shadow-md"
                >
                  <Stamp className="w-4 h-4" />
                  Sign & Approve Transition
                </button>
              </div>
            )}
          </div>
        )}

        {/* TABS NAVIGATION */}
        <div className="border-b border-slate-200">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab("milestones")}
              className={`py-3 px-1 text-sm font-semibold border-b-2 transition ${
                activeTab === "milestones"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Milestones & Deliverables ({project.milestones.length})
            </button>
            <button
              onClick={() => setActiveTab("csr")}
              className={`py-3 px-1 text-sm font-semibold border-b-2 transition ${
                activeTab === "csr"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Off-Platform CSR Ledger ({project.csrLedgerEntries.length})
            </button>
            <button
              onClick={() => setActiveTab("nep")}
              className={`py-3 px-1 text-sm font-semibold border-b-2 transition ${
                activeTab === "nep"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              NEP 2020 Student Credits & Team ({project.projectMembers.length})
            </button>
            <button
              onClick={() => setActiveTab("mou")}
              className={`py-3 px-1 text-sm font-semibold border-b-2 transition ${
                activeTab === "mou"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Bilateral MoUs ({project.mous.length})
            </button>
          </nav>
        </div>

        {/* TAB 1: MILESTONES & DELIVERABLES */}
        {activeTab === "milestones" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Phase Deliverables & Verification Fingerprints
              </h3>
              <button
                onClick={() => setIsSubmitMilestoneOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Milestone
              </button>
            </div>

            {project.milestones.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">No deliverables submitted yet for this project.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {project.milestones.map((m) => (
                  <div key={m.id} className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-bold rounded bg-slate-100 text-slate-700">
                          {m.phase}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">{m.title}</h4>
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          m.isCompleted
                            ? "bg-emerald-100 text-emerald-800"
                            : m.status === "SUBMITTED_FOR_APPROVAL"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {m.isCompleted ? "Approved & Completed" : m.status.replace("_", " ")}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600">{m.summary || m.description}</p>

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 font-mono">
                      <span>Hash: {m.contentHash.substring(0, 24)}...</span>
                      {m.artifactKeys && m.artifactKeys.length > 0 && (
                        <span>{m.artifactKeys.length} S3 artifact(s) attached</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: OFF-PLATFORM CSR MILESTONE LEDGER */}
        {activeTab === "csr" && (
          <div className="space-y-6">
            {/* Compliance Banner */}
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-1 text-xs text-amber-950">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                Statutory Non-Custodial Compliance Notice
              </div>
              <p>
                Off-platform CSR settlement &mdash; zero in-platform fund transfers. All CSR disbursements occur exclusively via external banking channels (NEFT/RTGS/Cheque/CSR Grant) directly between the corporate partner and the recipient institution outside the platform.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Off-Platform Banking Tranches Ledger
              </h3>
              {(isIndustryAffiliated || isSuperAdmin) && (
                <button
                  onClick={() => setIsRecordCsrOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Record Off-Platform Disbursement
                </button>
              )}
            </div>

            {project.csrLedgerEntries.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
                <Banknote className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">No off-platform CSR disbursements recorded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm">
                <table className="min-w-full divide-y divide-slate-200 text-xs text-left">
                  <thead className="bg-slate-50 font-bold text-slate-700">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Amount (₹)</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3">External Ref (UTR)</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {project.csrLedgerEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(entry.createdAt).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">
                          ₹{Number(entry.amount).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{entry.paymentMode}</td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {entry.externalReferenceNo || entry.transactionRef}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              entry.status === "VERIFIED"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.status === "SUBMITTED" && (isHeiAffiliated || isGovtOfficial || isSuperAdmin) ? (
                            <button
                              onClick={() => handleVerifyCsrEntry(entry.id)}
                              disabled={isVerifyingCsrId === entry.id}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition"
                            >
                              {isVerifyingCsrId === entry.id ? "Verifying..." : "Verify Deposit"}
                            </button>
                          ) : (
                            <span className="text-slate-400 italic">Confirmed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: NEP 2020 STUDENT CREDITS & TEAM */}
        {activeTab === "nep" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-indigo-600" />
                NEP 2020 Experiential Learning Credit Allocation
              </h3>
              <p className="text-xs text-slate-600">
                Under NEP 2020 Guidelines, students enrolled in verified industry-aligned R&D projects earn experiential credits upon completed phase dual-signature signoffs.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                <div className="p-3 bg-amber-50 rounded-lg text-center border border-amber-200">
                  <span className="text-xs text-amber-700 font-semibold block">Proof of Concept</span>
                  <span className="text-xl font-extrabold text-amber-950">2 Credits</span>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg text-center border border-blue-200">
                  <span className="text-xs text-blue-700 font-semibold block">Prototyping</span>
                  <span className="text-xl font-extrabold text-blue-950">4 Credits</span>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center border border-purple-200">
                  <span className="text-xs text-purple-700 font-semibold block">Field Testing</span>
                  <span className="text-xl font-extrabold text-purple-950">6 Credits</span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg text-center border border-emerald-200">
                  <span className="text-xs text-emerald-700 font-semibold block">IP & Transfer</span>
                  <span className="text-xl font-extrabold text-emerald-950">8 Credits</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                Multidisciplinary Research Team
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {project.projectMembers.map((member) => (
                  <div key={member.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{member.user.fullName}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                        {member.role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{member.user.email}</p>
                    {member.role === "STUDENT" && project.nepCreditSummary && (
                      <p className="text-[11px] font-semibold text-emerald-700 pt-1">
                        NEP Accrued: {project.nepCreditSummary.earnedCredits} Credits
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BILATERAL MOUS */}
        {activeTab === "mou" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Bilateral Research & IP Allocation MoUs
              </h3>
              <Link
                href={`/projects/${project.id}/mou`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
              >
                <FileCheck className="w-3.5 h-3.5" />
                Open Formal Printable MoU
              </Link>
            </div>

            {project.mous.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">No MoU drafted yet for this project.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {project.mous.map((m) => (
                  <div key={m.id} className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-900">Ref: {m.mouNumber}</h4>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          m.status === "MUTUALLY_ACKNOWLEDGED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {m.status.replace("_", " ")}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600">
                      IP Split: HEI: {m.ipOwnershipSplit?.heiPercentage || 70}%, Industry: {m.ipOwnershipSplit?.industryPercentage || 30}%
                    </p>
                    <p className="text-xs text-slate-500 italic line-clamp-2">
                      &ldquo;{m.complianceClause}&rdquo;
                    </p>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Created {new Date(m.createdAt).toLocaleDateString("en-IN")}</span>
                      <Link
                        href={`/projects/${project.id}/mou`}
                        className="text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                      >
                        View Official Document <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: SUBMIT MILESTONE DELIVERABLE */}
      {isSubmitMilestoneOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Submit Milestone Deliverables</h3>
              <button onClick={() => setIsSubmitMilestoneOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitMilestone} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Target PLM Phase</label>
                <input
                  type="text"
                  disabled
                  value={project.currentPhase}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Deliverable Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Microgrid Firmware & Circuit Schematics"
                  value={milestoneTitle}
                  onChange={(e) => setMilestoneTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Technical Summary</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Summarize SPICE benchmarks, test results, and experimental observations..."
                  value={milestoneSummary}
                  onChange={(e) => setMilestoneSummary(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Attach S3 Artifacts (PDF/ZIP)</label>
                <input
                  type="file"
                  onChange={handleArtifactUpload}
                  disabled={uploadingArtifact}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                />
                {uploadingArtifact && <p className="text-indigo-600 mt-1">Uploading directly to S3...</p>}
                {uploadedArtifactKeys.length > 0 && (
                  <p className="text-emerald-700 mt-1 font-mono">
                    Attached: {uploadedArtifactKeys.length} artifact(s)
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSubmitMilestoneOpen(false)}
                  className="px-3.5 py-2 font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMilestone || uploadingArtifact}
                  className="px-4 py-2 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmittingMilestone ? "Submitting..." : "Submit Deliverables"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DUAL-SIGNATURE TRANSITION SIGNING */}
      {isSignTransitionOpen && selectedMilestoneToSign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Sign & Approve Stage Gate Transition</h3>
              <button onClick={() => setIsSignTransitionOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSignature} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                <span className="font-semibold text-slate-700">Milestone:</span>
                <p className="font-bold text-slate-900">{selectedMilestoneToSign.title}</p>
                <span className="font-semibold text-slate-700">Hash:</span>
                <p className="font-mono text-[11px] text-slate-600 truncate">{selectedMilestoneToSign.contentHash}</p>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Decision</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="decision"
                      value="APPROVED"
                      checked={signDecision === "APPROVED"}
                      onChange={() => setSignDecision("APPROVED")}
                    />
                    <span className="font-bold text-emerald-700">Approve Stage Transition</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="decision"
                      value="REJECTED"
                      checked={signDecision === "REJECTED"}
                      onChange={() => setSignDecision("REJECTED")}
                    />
                    <span className="font-bold text-red-600">Reject Deliverables</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Remarks / Affirmation</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Record your formal verification observations..."
                  value={signRemarks}
                  onChange={(e) => setSignRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSignTransitionOpen(false)}
                  className="px-3.5 py-2 font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSign}
                  className="px-4 py-2 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmittingSign ? "Signing..." : "Confirm & Sign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD OFF-PLATFORM CSR DISBURSEMENT */}
      {isRecordCsrOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Record Off-Platform CSR Disbursement</h3>
              <button onClick={() => setIsRecordCsrOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordCsr} className="space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
                <span className="font-bold">Compliance Reminder:</span> No in-platform payment execution. Submit UTR/Cheque reference for direct bank-to-bank settlement.
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Disbursement Amount (₹)</label>
                <input
                  type="number"
                  required
                  min={1}
                  placeholder="250000"
                  value={csrAmount}
                  onChange={(e) => setCsrAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Payment Mode</label>
                <select
                  value={csrPaymentMode}
                  onChange={(e) =>
                    setCsrPaymentMode(
                      e.target.value as "EXTERNAL_NEFT" | "RTGS" | "CHEQUE" | "CSR_GRANT"
                    )
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="EXTERNAL_NEFT">External NEFT Transfer</option>
                  <option value="RTGS">RTGS Banking Channel</option>
                  <option value="CHEQUE">Bank Cheque / DD</option>
                  <option value="CSR_GRANT">Direct CSR Foundation Grant</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">External UTR / Reference Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. UTR-HDFC-20261120-778899"
                  value={csrRefNo}
                  onChange={(e) => setCsrRefNo(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Tranche release details..."
                  value={csrRemarks}
                  onChange={(e) => setCsrRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRecordCsrOpen(false)}
                  className="px-3.5 py-2 font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCsr}
                  className="px-4 py-2 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmittingCsr ? "Recording..." : "Record Disbursement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
