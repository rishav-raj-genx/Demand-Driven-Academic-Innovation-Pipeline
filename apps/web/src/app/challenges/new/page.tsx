"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Compass,
  MapPin,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
  WifiOff,
  Sparkles,
  ArrowLeft,
  Navigation,
  FileText,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { enqueueOfflineChallenge } from "@/lib/offline/outbox";

// ============================================================================
// Jharkhand District Presets for Instant Demo Selection
// ============================================================================

const JHARKHAND_DISTRICTS = [
  { code: "JH_RAN", name: "Ranchi", lat: 23.3441, lng: 85.3096 },
  { code: "JH_ESN", name: "East Singhbhum (Jamshedpur)", lat: 22.8046, lng: 86.2029 },
  { code: "JH_DHN", name: "Dhanbad", lat: 23.7957, lng: 86.4304 },
  { code: "JH_BOK", name: "Bokaro", lat: 23.6693, lng: 86.1511 },
  { code: "JH_HAZ", name: "Hazaribagh", lat: 23.9937, lng: 85.3623 },
  { code: "JH_DEO", name: "Deoghar", lat: 24.4826, lng: 86.7001 },
  { code: "JH_DUM", name: "Dumka", lat: 24.2676, lng: 87.2472 },
  { code: "JH_PAL", name: "Palamu (Medininagar)", lat: 24.0416, lng: 84.0722 },
];

const DOMAIN_OPTIONS = [
  "Water Filtration",
  "Solar Micro-Grids",
  "Tribal Healthcare",
  "Smart Agriculture",
  "Mining Dust/Safety",
  "Solid Waste",
  "Rural Digital Literacy",
  "Cold Storage",
];

const URGENCY_OPTIONS = [
  { value: "LOW", label: "Low (Planned community need)", color: "text-slate-400" },
  { value: "MEDIUM", label: "Medium (Seasonal / Moderate impact)", color: "text-blue-400" },
  { value: "HIGH", label: "High (Severe health / economic risk)", color: "text-amber-400" },
  { value: "CRITICAL", label: "Critical (Acute emergency / hazardous)", color: "text-red-400" },
];

interface UploadFileState {
  file: File;
  previewUrl: string;
}

export default function NewChallengePage() {
  const router = useRouter();

  // Form Fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState(DOMAIN_OPTIONS[0]);
  const [urgency, setUrgency] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [latitude, setLatitude] = useState<string>("23.3441");
  const [longitude, setLongitude] = useState<string>("85.3096");
  const [selectedDistrictCode, setSelectedDistrictCode] = useState("JH_RAN");

  // Media attachments
  const [files, setFiles] = useState<UploadFileState[]>([]);

  // Status & Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submissionResult, setSubmissionResult] = useState<{
    type: "LIVE_SUCCESS" | "OFFLINE_QUEUED";
    message: string;
    challengeId?: string;
  } | null>(null);

  // Online detection
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const onOnline = () => setIsOnline(true);
      const onOffline = () => setIsOnline(false);
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      return () => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      };
    }
  }, []);

  // Quick District Selection
  const handleDistrictSelect = (districtCode: string) => {
    setSelectedDistrictCode(districtCode);
    const d = JHARKHAND_DISTRICTS.find((item) => item.code === districtCode);
    if (d) {
      setLatitude(d.lat.toString());
      setLongitude(d.lng.toString());
    }
  };

  // GPS Location Trigger
  const handleUseGps = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setSelectedDistrictCode("");
        setIsGpsLoading(false);
      },
      (err) => {
        console.warn("[GPS] Location error:", err);
        alert("Unable to retrieve location. Using default Jharkhand coordinates.");
        setIsGpsLoading(false);
      },
      { timeout: 8000 }
    );
  };

  // File Handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);

    if (files.length + newFiles.length > 4) {
      alert("Maximum 4 media attachments allowed");
      return;
    }

    const updated = [...files];
    for (const file of newFiles) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} exceeds 10 MB limit`);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      updated.push({ file, previewUrl });
    }
    setFiles(updated);
  };

  const removeFile = (index: number) => {
    const updated = [...files];
    URL.revokeObjectURL(updated[index].previewUrl);
    updated.splice(index, 1);
    setFiles(updated);
  };

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (title.trim().length < 10 || title.trim().length > 140) {
      newErrors.title = "Title must be between 10 and 140 characters";
    }
    if (description.trim().length < 30 || description.trim().length > 3000) {
      newErrors.description = "Problem narrative must be between 30 and 3000 characters";
    }
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      newErrors.latitude = "Latitude must be between -90 and 90";
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      newErrors.longitude = "Longitude must be between -180 and 180";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submission Pipeline
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmissionResult(null);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const clientIdempotencyKey = crypto.randomUUID();

    const payload = {
      title: title.trim(),
      description: description.trim(),
      domain,
      urgency,
      latitude: lat,
      longitude: lng,
    };

    // Branch A: Device is Offline -> Enqueue in IndexedDB Outbox
    if (!isOnline) {
      try {
        await enqueueOfflineChallenge({
          payload,
          mediaFiles: files.map((f) => f.file),
          clientIdempotencyKey,
        });

        setSubmissionResult({
          type: "OFFLINE_QUEUED",
          message: `Saved to device outbox! Your submission and ${files.length} photo(s) are stored safely and will sync automatically when your device reconnects.`,
        });
      } catch (err) {
        console.error("[Offline Queue Error]", err);
        alert("Failed to save offline draft to IndexedDB.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Branch B: Device is Online -> Live S3 Upload + Direct API Submission
    try {
      const mediaKeys: string[] = [];

      // 1. Upload photos via S3 presigned URLs
      for (const item of files) {
        const presignRes = await fetch("/api/v1/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: item.file.name,
            contentType: item.file.type || "image/png",
            fileSizeBytes: item.file.size,
            purpose: "challenge_media",
          }),
        });

        if (!presignRes.ok) {
          throw new Error("Failed to generate presigned upload URL");
        }

        const presignData = await presignRes.json();
        const { uploadUrl, key } = presignData.data;

        const s3Res = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": item.file.type || "image/png" },
          body: item.file,
        });

        if (!s3Res.ok) {
          throw new Error("Direct S3 photo upload failed");
        }

        mediaKeys.push(key);
      }

      // 2. Submit Challenge to POST /api/v1/challenges
      const challengeRes = await fetch("/api/v1/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          mediaKeys,
          clientIdempotencyKey,
        }),
      });

      if (!challengeRes.ok) {
        const errorJson = await challengeRes.json().catch(() => ({}));
        throw new Error(errorJson?.error?.message || "Failed to submit challenge");
      }

      const challengeJson = await challengeRes.json();
      const challengeId = challengeJson?.data?.id;

      setSubmissionResult({
        type: "LIVE_SUCCESS",
        message:
          "Challenge submitted live to the Jharkhand Innovation Pipeline and enqueued for AI capability matchmaking!",
        challengeId,
      });
    } catch (err: unknown) {
      console.warn("[Live Submission Failed] Falling back to offline outbox:", err);

      // Graceful Fallback: If live network failed midway, store in offline outbox!
      try {
        await enqueueOfflineChallenge({
          payload,
          mediaFiles: files.map((f) => f.file),
          clientIdempotencyKey,
        });

        setSubmissionResult({
          type: "OFFLINE_QUEUED",
          message:
            "Network connectivity dropped during upload. Your submission was safely saved to the offline outbox and will automatically retry when reconnected.",
        });
      } catch (outboxErr) {
        alert("Failed to complete submission or save to outbox: " + String(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto py-4 sm:py-8 px-2 sm:px-0">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 mb-4">
          <Link
            href="/challenges"
            className="flex items-center space-x-1 hover:text-blue-400 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Challenge Explorer</span>
          </Link>
          <span>/</span>
          <span className="text-blue-400">Citizen Submission (PWA)</span>
        </div>

        {/* Page Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
                <Compass className="w-4 h-4" />
                <span>Grassroots Innovation Intake</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                Submit a Civic or Industrial Challenge
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-300">
                Identify real-world problems in your district. High-urgency challenges are matched with research teams across Jharkhand HEIs.
              </p>
            </div>

            {/* Offline vs Online Indicator */}
            <div
              className={`shrink-0 inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                isOnline
                  ? "bg-emerald-950/80 text-emerald-300 border-emerald-800/80"
                  : "bg-amber-950/80 text-amber-300 border-amber-800/80"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
              <span>{isOnline ? "Online (Live Sync)" : "Offline (Outbox Queue)"}</span>
            </div>
          </div>
        </div>

        {/* Feedback / Success Notification Banner */}
        {submissionResult && (
          <div
            className={`mb-6 p-5 rounded-2xl border ${
              submissionResult.type === "LIVE_SUCCESS"
                ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-200"
                : "bg-amber-950/40 border-amber-800/80 text-amber-200"
            }`}
          >
            <div className="flex items-start space-x-3">
              {submissionResult.type === "LIVE_SUCCESS" ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <WifiOff className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h3 className="font-bold text-sm sm:text-base">
                  {submissionResult.type === "LIVE_SUCCESS"
                    ? "Submission Confirmed!"
                    : "Draft Queued in Offline Outbox!"}
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-slate-300">
                  {submissionResult.message}
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  {submissionResult.challengeId && (
                    <Link
                      href={`/challenges/${submissionResult.challengeId}`}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs sm:text-sm font-semibold transition"
                    >
                      View Challenge Narrative
                    </Link>
                  )}
                  <Link
                    href="/challenges"
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs sm:text-sm font-semibold transition"
                  >
                    Return to Explorer
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionResult(null);
                      setTitle("");
                      setDescription("");
                      setFiles([]);
                    }}
                    className="px-4 py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-lg text-xs sm:text-sm transition"
                  >
                    Submit Another Challenge
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Challenge Intake Form */}
        {!submissionResult && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. Problem Narrative Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span>1. Problem Narrative</span>
              </h2>

              {/* Title Input */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="challenge-title" className="text-xs font-semibold text-slate-300">
                    Challenge Title <span className="text-red-400">*</span>
                  </label>
                  <span className="text-xs text-slate-500">{title.length} / 140</span>
                </div>
                <input
                  id="challenge-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Decentralized Solar Water Fluoride Filter for Netarhat Hamlets"
                  maxLength={140}
                  className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                    errors.title ? "border-red-500" : "border-slate-800"
                  }`}
                />
                {errors.title && (
                  <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{errors.title}</span>
                  </p>
                )}
              </div>

              {/* Problem Statement Narrative */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="challenge-description" className="text-xs font-semibold text-slate-300">
                    Detailed Problem Statement & Context <span className="text-red-400">*</span>
                  </label>
                  <span className="text-xs text-slate-500">{description.length} / 3000</span>
                </div>
                <textarea
                  id="challenge-description"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the societal issue, affected population, current failed attempts, and the desired technical solution in detail (minimum 30 characters)..."
                  maxLength={3000}
                  className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                    errors.description ? "border-red-500" : "border-slate-800"
                  }`}
                />
                {errors.description && (
                  <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{errors.description}</span>
                  </p>
                )}
              </div>

              {/* Domain & Urgency Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label htmlFor="challenge-domain" className="block text-xs font-semibold text-slate-300 mb-1">
                    Technical Domain
                  </label>
                  <select
                    id="challenge-domain"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  >
                    {DOMAIN_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="challenge-urgency" className="block text-xs font-semibold text-slate-300 mb-1">
                    Urgency Level
                  </label>
                  <select
                    id="challenge-urgency"
                    value={urgency}
                    onChange={(e) =>
                      setUrgency(e.target.value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  >
                    {URGENCY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 2. PostGIS Geographic Location Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <span>2. Geographic District & Coordinates</span>
                </h2>

                <button
                  type="button"
                  onClick={handleUseGps}
                  disabled={isGpsLoading}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition"
                >
                  {isGpsLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Navigation className="w-3.5 h-3.5" />
                  )}
                  <span>{isGpsLoading ? "Locating..." : "Use My GPS"}</span>
                </button>
              </div>

              {/* District Quick-Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">
                  Jharkhand District Quick-Picker (Auto-sets Centroid Coordinates):
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {JHARKHAND_DISTRICTS.map((dist) => (
                    <button
                      key={dist.code}
                      type="button"
                      onClick={() => handleDistrictSelect(dist.code)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium text-left transition border ${
                        selectedDistrictCode === dist.code
                          ? "bg-blue-600 text-white border-blue-500 shadow-md"
                          : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-bold truncate">{dist.name}</div>
                      <div className="text-[10px] opacity-80">{dist.code}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Coordinates Readout / Editable Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label htmlFor="challenge-latitude" className="block text-xs text-slate-400 mb-1">
                    Latitude (°N)
                  </label>
                  <input
                    id="challenge-latitude"
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {errors.latitude && <p className="text-xs text-red-400 mt-1">{errors.latitude}</p>}
                </div>
                <div>
                  <label htmlFor="challenge-longitude" className="block text-xs text-slate-400 mb-1">
                    Longitude (°E)
                  </label>
                  <input
                    id="challenge-longitude"
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {errors.longitude && <p className="text-xs text-red-400 mt-1">{errors.longitude}</p>}
                </div>
              </div>
            </div>

            {/* 3. Media Attachments Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <Upload className="w-4 h-4 text-purple-400" />
                  <span>3. Field Evidence & Photos (Max 4)</span>
                </h2>
                <span className="text-xs text-slate-400">{files.length} / 4 attached</span>
              </div>

              {/* Upload Dropzone */}
              {files.length < 4 && (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-blue-500/50 bg-slate-950/60 rounded-xl p-6 cursor-pointer transition">
                  <Upload className="w-8 h-8 text-slate-500 mb-2" />
                  <span className="text-xs font-semibold text-slate-300">
                    Click to attach field photos or research artifacts
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1">
                    JPEG, PNG, WebP or PDF (up to 10 MB per file)
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}

              {/* Preview Grid */}
              {files.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {files.map((item, idx) => (
                    <div
                      key={idx}
                      className="relative group bg-slate-950 border border-slate-800 rounded-xl overflow-hidden aspect-video flex items-center justify-center"
                    >
                      {item.file.type.startsWith("image/") ? (
                        <img
                          src={item.previewUrl}
                          alt={`Attachment ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-2 text-center">
                          <FileText className="w-6 h-6 text-blue-400 mb-1" />
                          <span className="text-[10px] text-slate-300 truncate w-24">
                            {item.file.name}
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="absolute top-1 right-1 p-1 bg-red-600 hover:bg-red-500 text-white rounded-full shadow-md transition"
                        title="Remove attachment"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Action Bar */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-400">
                {isOnline ? (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Connected: Immediate S3 upload + AI pipeline enqueueing
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    Offline: Will store in local IndexedDB outbox
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-xl text-sm font-bold shadow-lg transition flex items-center justify-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Submission...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{isOnline ? "Submit Challenge Live" : "Save to Offline Outbox"}</span>
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
