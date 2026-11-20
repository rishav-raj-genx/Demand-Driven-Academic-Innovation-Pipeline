"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileText,
  Loader2,
  Trash2,
  ArrowRight,
  Database,
  Building2,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { AppShell, type ShellUser } from "@/components/AppShell";

interface RejectedRow {
  row: number;
  aisheCode: string | null;
  reason: string;
}

interface ImportedRowResult {
  row: number;
  id: string;
  code: string;
  name: string;
  action: "IMPORTED" | "UPDATED";
}

interface BulkImportResponseData {
  total: number;
  imported: number;
  updated: number;
  rejectedCount: number;
  rejected: RejectedRow[];
  results: ImportedRowResult[];
}

const SAMPLE_CSV_CONTENT = `name,aisheCode,tier,districtCode,latitude,longitude,maxCapacity,domains,facultySpecializations,labFacilities,profileSummary
Bokaro Steel City College,C-44150,TIER_2,JH_BOK,23.6690,86.1510,15,"Metallurgical Engineering;Materials Science;Industrial Automation","Blast Furnace Modeling;Alloy Steel Design;Slag Utilization","High-Temperature Metallurgy Lab;Material Testing Lab;Automated Foundry Cell","Premier constituent college in Bokaro industrial belt providing technical education and research for metallurgy and heavy industries."
St. Columbas College Hazaribagh,C-44210,TIER_2,JH_HAZ,23.9980,85.3620,12,"Biotechnology;Environmental Science;Geology","Bio-Remediation of Coal Mine Spoils;Sedimentology;Water Quality Analytics","Biotech Research Center;Water Purification Testing Lab;GIS Remote Sensing Unit","Historic institution established in 1899 with modern research facilities in environmental biotechnology and regional geology."
Deoghar College Deoghar,C-44320,TIER_3,JH_DEO,24.4780,86.6920,10,"Solar Energy;Renewable Systems;Agricultural Technology","Decentralized Solar Pumping;Micro-Irrigation Tech;Agro-Waste Valorization","Solar Testing Bench;Soil and Agro-Chemical Analysis Unit;Rural Tech Fabrication Workshop","Santhal Pargana regional technical and degree hub driving decentralized clean energy and agricultural innovations."`;

export default function BulkImportPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [responseData, setResponseData] = useState<BulkImportResponseData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleFileSelect(file: File) {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".json")) {
      setErrorMessage("Please select a valid CSV (.csv) or JSON (.json) file");
      return;
    }
    setErrorMessage(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || "";
      setFileContent(text);
    };
    reader.readAsText(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }

  function handleDownloadSample() {
    const blob = new Blob([SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "sample_hei_bulk_import.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleImportSubmit() {
    if (!fileContent.trim()) {
      setErrorMessage("No dataset content available to import");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const isJson = selectedFile?.name.endsWith(".json") || fileContent.trim().startsWith("[");
      const contentType = isJson ? "application/json" : "text/csv";

      const res = await fetch("/api/v1/institutions/bulk-import", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: fileContent,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || "Bulk import failed");
      }

      setResponseData(json.data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An error occurred during import");
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetImport() {
    setSelectedFile(null);
    setFileContent("");
    setResponseData(null);
    setErrorMessage(null);
  }

  // Combined rows for results table
  const tableRows: Array<{
    row: number;
    name: string;
    code: string;
    status: "IMPORTED" | "UPDATED" | "REJECTED";
    details: string;
  }> = [];

  if (responseData) {
    // Add success results
    for (const res of responseData.results) {
      tableRows.push({
        row: res.row,
        name: res.name,
        code: res.code,
        status: res.action,
        details:
          res.action === "IMPORTED"
            ? "New institution created with PostGIS point and BullMQ hei.embed queued"
            : "Existing institution updated; vector re-embedding re-queued",
      });
    }
    // Add rejected rows
    for (const rej of responseData.rejected) {
      tableRows.push({
        row: rej.row,
        name: "Unknown / Rejected Entity",
        code: rej.aisheCode || "N/A",
        status: "REJECTED",
        details: rej.reason,
      });
    }
    // Sort by row ascending
    tableRows.sort((a, b) => a.row - b.row);
  }

  return (
    <AppShell>
      <div className="py-6 space-y-8 max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
              <Database className="w-4 h-4" />
              <span>Platform Administration & Cold-Start Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center space-x-2">
              <FileSpreadsheet className="w-6 h-6 text-blue-400" />
              <span>Bulk Institutional Profile Importer</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Ingest AISHE-aligned CSV or JSON datasets to bootstrap institutional research telemetry and pgvector indexes.
            </p>
          </div>

          {/* Download Sample Button */}
          <button
            type="button"
            onClick={handleDownloadSample}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 transition shadow-md"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Download Sample CSV Template</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start space-x-3 text-red-300 shadow-xl">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-bold text-red-400 text-sm">Import Error</div>
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Upload Zone (If no response yet) */}
        {!responseData && (
          <div className="space-y-6">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                isDragging
                  ? "border-blue-500 bg-blue-500/10"
                  : selectedFile
                  ? "border-emerald-500/60 bg-emerald-500/5"
                  : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
              }`}
            >
              <input
                type="file"
                accept=".csv,.json"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                className="hidden"
                id="bulk-file-upload"
              />
              <label htmlFor="bulk-file-upload" className="cursor-pointer block">
                <UploadCloud
                  className={`w-12 h-12 mx-auto mb-3 transition-colors ${
                    selectedFile ? "text-emerald-400" : isDragging ? "text-blue-400" : "text-slate-500"
                  }`}
                />
                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-white">{selectedFile.name}</p>
                    <p className="text-xs text-emerald-400 font-semibold">
                      {(selectedFile.size / 1024).toFixed(1)} KB • Ready for Ingestion
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-white">
                      Drag & drop your CSV or JSON file here, or click to browse
                    </p>
                    <p className="text-xs text-slate-400">
                      Supports AISHE columns: name, aisheCode, tier, districtCode, latitude, longitude, maxCapacity, domains
                    </p>
                  </div>
                )}
              </label>
            </div>

            {/* Action Bar */}
            {selectedFile && (
              <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <button
                  type="button"
                  onClick={resetImport}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-semibold rounded-xl transition flex items-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear File</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleImportSubmit}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center space-x-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Ingesting Dataset & Enqueueing BullMQ Embeddings...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Bulk Import ({selectedFile.name})</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Results Section (When Response is Available) */}
        {responseData && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-300">
            {/* Metric Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400 font-medium">Total Rows</div>
                <div className="text-2xl font-black text-white mt-1">{responseData.total}</div>
                <div className="text-[10px] text-slate-500">Processed in batch</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-emerald-400 font-medium">Imported (New)</div>
                <div className="text-2xl font-black text-emerald-400 mt-1">{responseData.imported}</div>
                <div className="text-[10px] text-slate-500">PostGIS points created</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-blue-400 font-medium">Updated (Existing)</div>
                <div className="text-2xl font-black text-blue-400 mt-1">{responseData.updated}</div>
                <div className="text-[10px] text-slate-500">Profiles refreshed</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-red-400 font-medium">Rejected (Errors)</div>
                <div className="text-2xl font-black text-red-400 mt-1">{responseData.rejectedCount}</div>
                <div className="text-[10px] text-slate-500">Isolated cleanly</div>
              </div>
            </div>

            {/* Detailed Row-by-Row Results Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Row-by-Row Ingestion Report</h3>
                  <p className="text-xs text-slate-400">
                    Granular validation results per row with error diagnostics.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={resetImport}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded-lg transition flex items-center space-x-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Import Another File</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-bold text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Row #</th>
                      <th className="py-3 px-4">Institution Name</th>
                      <th className="py-3 px-4">AISHE Code</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Diagnostics / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {tableRows.map((row) => (
                      <tr key={`${row.row}-${row.code}`} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-mono text-slate-400 font-bold">#{row.row}</td>
                        <td className="py-3 px-4 font-semibold text-white">{row.name}</td>
                        <td className="py-3 px-4 font-mono text-blue-400">{row.code}</td>
                        <td className="py-3 px-4">
                          {row.status === "IMPORTED" ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>IMPORTED</span>
                            </span>
                          ) : row.status === "UPDATED" ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              <RefreshCw className="w-3 h-3" />
                              <span>UPDATED</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                              <AlertCircle className="w-3 h-3" />
                              <span>REJECTED</span>
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-3 px-4 text-xs ${
                            row.status === "REJECTED" ? "text-red-300 font-medium" : "text-slate-300"
                          }`}
                        >
                          {row.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
