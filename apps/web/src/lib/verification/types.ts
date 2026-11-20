export type VerificationSource = "CONTROLLED_MOCK_MVP";
export type VerificationStatusType = "VERIFIED" | "REJECTED" | "NOT_FOUND" | "PENDING";

export interface BaseVerificationResult {
  verified: boolean;
  status: VerificationStatusType;
  source: VerificationSource;
  isOfficialLiveApi: false;
  badge: "Controlled Mock (MVP)";
  verifiedAt: string;
  message: string;
}

export interface AisheDetails {
  aisheCode: string;
  institutionName: string;
  state: string;
  district: string;
  institutionType: "UNIVERSITY" | "COLLEGE" | "STANDALONE";
  tier?: "TIER_1" | "TIER_2" | "TIER_3";
  accreditationStatus?: string;
  yearOfEstablishment?: number;
}

export interface AisheVerificationResult extends BaseVerificationResult {
  details?: AisheDetails;
}

export interface McaCinDetails {
  cin: string;
  companyName: string;
  registrationNumber: string;
  roc: string;
  companyCategory: string;
  incorporationDate: string;
  companyStatus: "ACTIVE" | "STRUCK_OFF" | "UNDER_LIQUIDATION";
  authorizedCapitalInr?: number;
}

export interface McaCinVerificationResult extends BaseVerificationResult {
  details?: McaCinDetails;
}

export interface UdyamDetails {
  udyamNumber: string;
  enterpriseName: string;
  enterpriseType: "MICRO" | "SMALL" | "MEDIUM";
  majorActivity: "MANUFACTURING" | "SERVICES";
  state: string;
  district: string;
  registrationDate: string;
  enterpriseStatus: "ACTIVE" | "CANCELLED";
}

export interface UdyamVerificationResult extends BaseVerificationResult {
  details?: UdyamDetails;
}

export interface VerificationProvider {
  verifyAisheCode(code: string): Promise<AisheVerificationResult>;
  verifyMcaCin(cin: string): Promise<McaCinVerificationResult>;
  verifyUdyamNumber(udyamNumber: string): Promise<UdyamVerificationResult>;
}
