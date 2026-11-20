"use client";

import React, { useState, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail, AlertCircle, ArrowRight, CheckCircle2, Shield, GraduationCap, Building2, Briefcase } from "lucide-react";

const LoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof LoginSchema>;

interface DemoRolePreset {
  roleName: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  email: string;
  password: string;
  description: string;
}

const DEMO_PRESETS: DemoRolePreset[] = [
  {
    roleName: "Citizen / Student",
    badge: "STUDENT",
    icon: GraduationCap,
    email: "student@sih.gov.in",
    password: "DemoPassword123!",
    description: "Submit demands, explore campus labs & track solutions",
  },
  {
    roleName: "HEI Admin",
    badge: "INSTITUTION_ADMIN",
    icon: Building2,
    email: "inst.admin@sih.gov.in",
    password: "DemoPassword123!",
    description: "Manage BIT Mesra capacity, faculty & lab matchings",
  },
  {
    roleName: "Industry / MSME Partner",
    badge: "INDUSTRY_PARTNER",
    icon: Briefcase,
    email: "industry@tata.com",
    password: "DemoPassword123!",
    description: "Post challenges, fund prototypes & sign milestone transitions",
  },
  {
    roleName: "Govt. Official / Super Admin",
    badge: "SUPER_ADMIN",
    icon: Shield,
    email: "admin@sih.gov.in",
    password: "DemoPassword123!",
    description: "District analytics, density maps & verification oversight",
  },
];

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/dashboard";

  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDemoRole, setSelectedDemoRole] = useState<string | null>(null);

  const enableDemoHelper = process.env.NEXT_PUBLIC_ENABLE_DEMO_HELPER !== "false";

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setServerError(result?.error?.message || "Invalid credentials. Please verify your email and password.");
        return;
      }

      router.push(from);
      router.refresh();
    } catch {
      setServerError("Network error. Unable to connect to authentication service.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPreset = (preset: DemoRolePreset) => {
    setSelectedDemoRole(preset.roleName);
    setValue("email", preset.email, { shouldValidate: true });
    setValue("password", preset.password, { shouldValidate: true });
    setServerError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link
          href="/"
          className="inline-flex items-center space-x-2 text-blue-400 font-bold text-2xl tracking-tight focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-lg shadow-lg">
            JH
          </div>
          <span>SIH26043 Pipeline</span>
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold text-white tracking-tight">
          Sign In to Your Workspace
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Connecting Academic Research with Real-World Industrial Demands
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl px-4 sm:px-0">
        {/* Demo Role Switcher Panel for SIH Judges */}
        {enableDemoHelper && (
          <div className="mb-6 bg-slate-900 border border-blue-500/30 rounded-xl p-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  SIH Judge & Evaluator Demo Switcher
                </h2>
              </div>
              <span className="text-[11px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-mono">
                1-Click Populate
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Select any pre-seeded persona to populate credentials immediately without manual typing:
            </p>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEMO_PRESETS.map((preset) => {
                const Icon = preset.icon;
                const isSelected = selectedDemoRole === preset.roleName;
                return (
                  <button
                    key={preset.roleName}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`flex flex-col text-left p-2.5 rounded-lg border transition-all text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isSelected
                        ? "bg-blue-600/20 border-blue-500 text-white shadow-sm"
                        : "bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 text-slate-300"
                    }`}
                    aria-label={`Select ${preset.roleName} demo preset`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
                        <Icon className="w-3.5 h-3.5 text-blue-400" />
                        <span>{preset.roleName}</span>
                      </div>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <span className="mt-1 text-[11px] font-mono text-slate-400 truncate">
                      {preset.email}
                    </span>
                    <span className="mt-0.5 text-[10px] text-slate-500 line-clamp-1">
                      {preset.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Login Form Box */}
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {serverError && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start space-x-3 text-red-400 text-sm"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email Address
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-5 w-5" aria-hidden="true" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  {...register("email")}
                  className={`block w-full pl-10 pr-3 py-2.5 bg-slate-950 border rounded-lg text-sm text-slate-100 placeholder-slate-500 transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.email ? "border-red-500" : "border-slate-800"
                  }`}
                  placeholder="name@organization.com"
                />
              </div>
              {errors.email && (
                <p id="email-error" role="alert" className="mt-1.5 text-xs text-red-400">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 w-5" aria-hidden="true" />
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  {...register("password")}
                  className={`block w-full pl-10 pr-3 py-2.5 bg-slate-950 border rounded-lg text-sm text-slate-100 placeholder-slate-500 transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.password ? "border-red-500" : "border-slate-800"
                  }`}
                  placeholder="••••••••••••"
                />
              </div>
              {errors.password && (
                <p id="password-error" role="alert" className="mt-1.5 text-xs text-red-400">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Registration Prompt Link */}
          <div className="mt-6 text-center text-xs text-slate-400">
            <span>Don&apos;t have an account yet? </span>
            <Link
              href="/register"
              className="font-medium text-blue-400 hover:text-blue-300 underline focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
            >
              Register here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading workspace...</div>}>
      <LoginFormContent />
    </Suspense>
  );
}
