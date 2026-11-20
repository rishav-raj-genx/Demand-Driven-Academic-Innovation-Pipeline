import { Activity, ShieldCheck, ArrowRight, Layers, Sparkles, Database } from "lucide-react";
import { ProjectPhase } from "@sih/shared";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-8 md:p-24 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm flex border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <p className="font-semibold text-slate-200">SIH26043 // The Unknowns</p>
        </div>
        <div className="text-xs text-slate-400 bg-slate-800/60 px-3 py-1 rounded-full border border-slate-700">
          Core Engine v0.2.0
        </div>
      </div>

      <div className="my-16 text-center max-w-3xl space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm font-medium">
          <Sparkles className="w-4 h-4" />
          Demand-Driven Academic Innovation Pipeline
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white">
          Accelerating Research to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Industry Scale</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl leading-relaxed">
          Autonomous matchmaking connecting institutional researchers with real-world enterprise demand, verified via milestone-gated Product Lifecycle Management (PLM).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-5xl w-full mb-12">
        {Object.values(ProjectPhase).map((phase, idx) => (
          <div
            key={phase}
            className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm hover:border-slate-700 transition-all"
          >
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
              Phase 0{idx + 1}
            </div>
            <div className="text-sm font-bold text-slate-200">{phase}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40">
          <Layers className="w-6 h-6 text-blue-400 mb-3" />
          <h3 className="font-bold text-slate-100 text-base mb-2">Monorepo Orchestration</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Strict TypeScript architecture sharing validated Zod schemas, contracts, and lifecycle state machines across web and worker runtimes.
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40">
          <Database className="w-6 h-6 text-emerald-400 mb-3" />
          <h3 className="font-bold text-slate-100 text-base mb-2">Hybrid Spatial & Vector DB</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            PostgreSQL 16 with native PostGIS proximity searching and pgvector semantic embeddings for accurate problem-research pairing.
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40">
          <ShieldCheck className="w-6 h-6 text-purple-400 mb-3" />
          <h3 className="font-bold text-slate-100 text-base mb-2">Milestone Governance</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Automated verification pipelines, multi-stakeholder consensus, and verifiable audit trails protecting intellectual property.
          </p>
        </div>
      </div>

      <footer className="mt-16 text-xs text-slate-500 font-mono flex items-center gap-4">
        <span>Team: The Unknowns</span>
        <span>•</span>
        <a
          href="/api/v1/health"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Health Probe</span>
          <ArrowRight className="w-3 h-3" />
        </a>
      </footer>
    </main>
  );
}
