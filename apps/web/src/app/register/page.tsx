"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Lock,
  Phone,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Building,
} from "lucide-react";

const RegisterFormSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters long"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  role: z.enum([
    "CITIZEN",
    "STUDENT",
    "HEI_ADMIN",
    "FACULTY",
    "RESEARCHER",
    "INDUSTRY_PARTNER",
    "CSR_PARTNER",
  ]),
  phoneNumber: z.string().optional(),
});

type RegisterFormData = z.infer<typeof RegisterFormSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdUserRole, setCreatedUserRole] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(RegisterFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      role: "STUDENT",
      phoneNumber: "",
    },
  });

  const selectedRole = watch("role");
  const isOrgRole = ["HEI_ADMIN", "INDUSTRY_PARTNER", "CSR_PARTNER"].includes(selectedRole);

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setServerError(
          result?.error?.message || "Registration failed. Please check your information."
        );
        return;
      }

      setCreatedUserRole(data.role);
      setIsSuccess(true);
    } catch {
      setServerError("Network error. Unable to connect to registration service.");
    } finally {
      setIsLoading(false);
    }
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
          Create Your Platform Account
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Democratizing Demand-Driven Innovation Across Jharkhand HEIs & MSMEs
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl px-4 sm:px-0">
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {isSuccess ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white">Account Created Successfully</h2>
              <p className="text-sm text-slate-300">
                {["HEI_ADMIN", "INDUSTRY_PARTNER", "CSR_PARTNER"].includes(createdUserRole) ? (
                  <>
                    Your organization account is initialized with{" "}
                    <span className="text-amber-400 font-semibold">PENDING_VERIFICATION</span>{" "}
                    status. Complete AISHE or MCA verification in onboarding to unlock the
                    workspace.
                  </>
                ) : (
                  <>
                    Your citizen/student profile is activated and ready for participation.
                  </>
                )}
              </p>
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Sign In to Workspace
                </Link>
                {["HEI_ADMIN", "INDUSTRY_PARTNER", "CSR_PARTNER"].includes(createdUserRole) && (
                  <Link
                    href="/onboarding/verify"
                    className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-500"
                  >
                    Open Verification Portal
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
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

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                {/* Full Name */}
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-slate-300">
                    Full Legal Name
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <User className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <input
                      id="fullName"
                      type="text"
                      autoComplete="name"
                      aria-invalid={Boolean(errors.fullName)}
                      aria-describedby={errors.fullName ? "name-error" : undefined}
                      {...register("fullName")}
                      className={`block w-full pl-10 pr-3 py-2 bg-slate-950 border rounded-lg text-sm text-slate-100 placeholder-slate-500 transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.fullName ? "border-red-500" : "border-slate-800"
                      }`}
                      placeholder="e.g. Dr. Ramesh Kumar"
                    />
                  </div>
                  {errors.fullName && (
                    <p id="name-error" role="alert" className="mt-1 text-xs text-red-400">
                      {errors.fullName.message}
                    </p>
                  )}
                </div>

                {/* Email Address */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                    Official Email Address
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
                      className={`block w-full pl-10 pr-3 py-2 bg-slate-950 border rounded-lg text-sm text-slate-100 placeholder-slate-500 transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.email ? "border-red-500" : "border-slate-800"
                      }`}
                      placeholder="official@institution.ac.in"
                    />
                  </div>
                  {errors.email && (
                    <p id="email-error" role="alert" className="mt-1 text-xs text-red-400">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Role Selector */}
                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-slate-300">
                    Platform Role / Stakeholder Type
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <select
                      id="role"
                      aria-invalid={Boolean(errors.role)}
                      {...register("role")}
                      className="block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="STUDENT">Student / Innovator</option>
                      <option value="CITIZEN">Citizen / Civic Problem Demander</option>
                      <option value="HEI_ADMIN">Higher Education Institution Admin (HEI)</option>
                      <option value="FACULTY">Faculty Member / Academic PI</option>
                      <option value="RESEARCHER">Research Scholar / Postdoc</option>
                      <option value="INDUSTRY_PARTNER">Industry / MSME Partner</option>
                      <option value="CSR_PARTNER">Corporate CSR Foundation Partner</option>
                    </select>
                  </div>

                  {/* Verification Policy Notice Callout */}
                  <div
                    className={`mt-2 p-2.5 rounded-lg border text-xs flex items-start space-x-2 ${
                      isOrgRole
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                        : "bg-blue-500/10 border-blue-500/20 text-blue-300"
                    }`}
                  >
                    {isOrgRole ? (
                      <>
                        <Building className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                        <span>
                          <strong>Organization Verification Required:</strong> HEI and Industry
                          accounts are assigned a pending status until verified via AISHE or
                          MCA/Udyam check.
                        </span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" />
                        <span>
                          <strong>Immediate Activation:</strong> Student and Citizen profiles are
                          activated immediately upon registration.
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                    Password (min. 8 characters)
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? "password-error" : undefined}
                      {...register("password")}
                      className={`block w-full pl-10 pr-3 py-2 bg-slate-950 border rounded-lg text-sm text-slate-100 placeholder-slate-500 transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.password ? "border-red-500" : "border-slate-800"
                      }`}
                      placeholder="••••••••••••"
                    />
                  </div>
                  {errors.password && (
                    <p id="password-error" role="alert" className="mt-1 text-xs text-red-400">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                {/* Phone Number (Optional) */}
                <div>
                  <label htmlFor="phoneNumber" className="block text-sm font-medium text-slate-300">
                    Contact Phone (Optional)
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Phone className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <input
                      id="phoneNumber"
                      type="tel"
                      autoComplete="tel"
                      {...register("phoneNumber")}
                      className="block w-full pl-10 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="+91-9876543210"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <span>Registering Account...</span>
                    ) : (
                      <>
                        <span>Complete Registration</span>
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Login Link */}
              <div className="mt-6 text-center text-xs text-slate-400">
                <span>Already have an account? </span>
                <Link
                  href="/login"
                  className="font-medium text-blue-400 hover:text-blue-300 underline focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
                >
                  Sign in here
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
