import type {
  VerificationProvider,
  AisheVerificationResult,
  McaCinVerificationResult,
  UdyamVerificationResult,
  AisheDetails,
  McaCinDetails,
  UdyamDetails,
} from "./types";

// ============================================================================
// 1. Deterministic AISHE Mock Dataset
// (All 10 seeded Jharkhand HEIs + 5 additional valid + explicit negative codes)
// ============================================================================

export const MOCK_AISHE_REGISTRY: Record<string, { status: "VERIFIED" | "REJECTED"; details?: AisheDetails; reason?: string }> = {
  // --- 10 Seeded Jharkhand HEIs ---
  "U-0205": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0205",
      institutionName: "National Institute of Technology Jamshedpur",
      state: "Jharkhand",
      district: "East Singhbhum",
      institutionType: "UNIVERSITY",
      tier: "TIER_1",
      accreditationStatus: "NAAC A+",
      yearOfEstablishment: 1960,
    },
  },
  "U-0202": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0202",
      institutionName: "Birla Institute of Technology Mesra",
      state: "Jharkhand",
      district: "Ranchi",
      institutionType: "UNIVERSITY",
      tier: "TIER_1",
      accreditationStatus: "NAAC A",
      yearOfEstablishment: 1955,
    },
  },
  "U-0210": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0210",
      institutionName: "Rajendra Institute of Medical Sciences Ranchi",
      state: "Jharkhand",
      district: "Ranchi",
      institutionType: "UNIVERSITY",
      tier: "TIER_1",
      accreditationStatus: "MCI Recognized",
      yearOfEstablishment: 1960,
    },
  },
  "C-44102": {
    status: "VERIFIED",
    details: {
      aisheCode: "C-44102",
      institutionName: "Birsa Institute of Technology Sindri",
      state: "Jharkhand",
      district: "Dhanbad",
      institutionType: "COLLEGE",
      tier: "TIER_2",
      accreditationStatus: "NBA Accredited",
      yearOfEstablishment: 1949,
    },
  },
  "U-0203": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0203",
      institutionName: "Birsa Agricultural University",
      state: "Jharkhand",
      district: "Ranchi",
      institutionType: "UNIVERSITY",
      tier: "TIER_2",
      accreditationStatus: "ICAR Accredited",
      yearOfEstablishment: 1981,
    },
  },
  "U-0207": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0207",
      institutionName: "Ranchi University",
      state: "Jharkhand",
      district: "Ranchi",
      institutionType: "UNIVERSITY",
      tier: "TIER_2",
      accreditationStatus: "NAAC B++",
      yearOfEstablishment: 1960,
    },
  },
  "U-0204": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0204",
      institutionName: "Kolhan University Chaibasa",
      state: "Jharkhand",
      district: "East Singhbhum",
      institutionType: "UNIVERSITY",
      tier: "TIER_3",
      accreditationStatus: "State University UGC 2(f)",
      yearOfEstablishment: 2009,
    },
  },
  "U-0208": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0208",
      institutionName: "Sido Kanhu Murmu University Dumka",
      state: "Jharkhand",
      district: "Dumka",
      institutionType: "UNIVERSITY",
      tier: "TIER_3",
      accreditationStatus: "State University UGC 12(B)",
      yearOfEstablishment: 1992,
    },
  },
  "U-0206": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0206",
      institutionName: "Nilamber Pitamber University Palamu",
      state: "Jharkhand",
      district: "Palamu",
      institutionType: "UNIVERSITY",
      tier: "TIER_3",
      accreditationStatus: "State University UGC 2(f)",
      yearOfEstablishment: 2009,
    },
  },
  "S-12055": {
    status: "VERIFIED",
    details: {
      aisheCode: "S-12055",
      institutionName: "Government Polytechnic Adityapur",
      state: "Jharkhand",
      district: "East Singhbhum",
      institutionType: "STANDALONE",
      tier: "TIER_3",
      accreditationStatus: "AICTE Approved",
      yearOfEstablishment: 1980,
    },
  },

  // --- 5 Additional Valid Test AISHE Codes ---
  "U-0001": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0001",
      institutionName: "Indian Institute of Technology Delhi",
      state: "Delhi",
      district: "New Delhi",
      institutionType: "UNIVERSITY",
      tier: "TIER_1",
      accreditationStatus: "Institute of National Importance",
      yearOfEstablishment: 1961,
    },
  },
  "U-0002": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0002",
      institutionName: "Indian Institute of Technology Bombay",
      state: "Maharashtra",
      district: "Mumbai",
      institutionType: "UNIVERSITY",
      tier: "TIER_1",
      accreditationStatus: "Institute of National Importance",
      yearOfEstablishment: 1958,
    },
  },
  "U-0003": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0003",
      institutionName: "Indian Institute of Science Bangalore",
      state: "Karnataka",
      district: "Bangalore Urban",
      institutionType: "UNIVERSITY",
      tier: "TIER_1",
      accreditationStatus: "Institute of Eminence",
      yearOfEstablishment: 1909,
    },
  },
  "C-10001": {
    status: "VERIFIED",
    details: {
      aisheCode: "C-10001",
      institutionName: "St. Xavier's College Ranchi",
      state: "Jharkhand",
      district: "Ranchi",
      institutionType: "COLLEGE",
      tier: "TIER_2",
      accreditationStatus: "Autonomous NAAC A+",
      yearOfEstablishment: 1944,
    },
  },
  "U-0004": {
    status: "VERIFIED",
    details: {
      aisheCode: "U-0004",
      institutionName: "Indian Institute of Technology Kharagpur",
      state: "West Bengal",
      district: "Paschim Medinipur",
      institutionType: "UNIVERSITY",
      tier: "TIER_1",
      accreditationStatus: "Institute of National Importance",
      yearOfEstablishment: 1951,
    },
  },

  // --- Bulk Import Sample Jharkhand Colleges ---
  "C-44150": {
    status: "VERIFIED",
    details: {
      aisheCode: "C-44150",
      institutionName: "Bokaro Steel City College",
      state: "Jharkhand",
      district: "Bokaro",
      institutionType: "COLLEGE",
      tier: "TIER_2",
      accreditationStatus: "NAAC B+",
      yearOfEstablishment: 1970,
    },
  },
  "C-44210": {
    status: "VERIFIED",
    details: {
      aisheCode: "C-44210",
      institutionName: "St. Columbas College Hazaribagh",
      state: "Jharkhand",
      district: "Hazaribagh",
      institutionType: "COLLEGE",
      tier: "TIER_2",
      accreditationStatus: "NAAC A",
      yearOfEstablishment: 1899,
    },
  },
  "C-44320": {
    status: "VERIFIED",
    details: {
      aisheCode: "C-44320",
      institutionName: "Deoghar College Deoghar",
      state: "Jharkhand",
      district: "Deoghar",
      institutionType: "COLLEGE",
      tier: "TIER_3",
      accreditationStatus: "NAAC B",
      yearOfEstablishment: 1962,
    },
  },

  // --- Explicit Negative Test Codes ---
  "U-FAKE-999": {
    status: "REJECTED",
    reason: "Fraudulent or unrecognized educational institution registration",
  },
  "U-FRAUD-123": {
    status: "REJECTED",
    reason: "Entity flagged on UGC/AICTE de-recognized list",
  },
};

// ============================================================================
// 2. Deterministic MCA CIN Dataset
// ============================================================================

export const MOCK_MCA_REGISTRY: Record<string, { status: "VERIFIED" | "REJECTED"; details?: McaCinDetails; reason?: string }> = {
  // 5 Seeded Industry Partners
  "U85100JH2016NPL008638": {
    status: "VERIFIED",
    details: {
      cin: "U85100JH2016NPL008638",
      companyName: "Tata Steel Foundation",
      registrationNumber: "008638",
      roc: "ROC Jharkhand",
      companyCategory: "Company limited by Shares / Section 8",
      incorporationDate: "2016-08-18",
      companyStatus: "ACTIVE",
      authorizedCapitalInr: 10000000,
    },
  },
  "U45201JH2005NPL011422": {
    status: "VERIFIED",
    details: {
      cin: "U45201JH2005NPL011422",
      companyName: "Adityapur Auto Cluster MSME Consortium",
      registrationNumber: "011422",
      roc: "ROC Jharkhand",
      companyCategory: "Company limited by Shares",
      incorporationDate: "2005-04-12",
      companyStatus: "ACTIVE",
      authorizedCapitalInr: 50000000,
    },
  },
  "U40106JH2019PTC013221": {
    status: "VERIFIED",
    details: {
      cin: "U40106JH2019PTC013221",
      companyName: "Jharkhand Renewable Innovations Private Limited",
      registrationNumber: "013221",
      roc: "ROC Jharkhand",
      companyCategory: "Private Limited Company",
      incorporationDate: "2019-07-25",
      companyStatus: "ACTIVE",
      authorizedCapitalInr: 2500000,
    },
  },
  "U27310JH2018PTC011984": {
    status: "VERIFIED",
    details: {
      cin: "U27310JH2018PTC011984",
      companyName: "Bokaro Eco-Industrial MSME Federation",
      registrationNumber: "011984",
      roc: "ROC Jharkhand",
      companyCategory: "Private Limited Company",
      incorporationDate: "2018-03-14",
      companyStatus: "ACTIVE",
      authorizedCapitalInr: 15000000,
    },
  },
  "U10200JH1975GOI001223": {
    status: "VERIFIED",
    details: {
      cin: "U10200JH1975GOI001223",
      companyName: "Central Coalfields Sustainable Development CSR Cell",
      registrationNumber: "001223",
      roc: "ROC Jharkhand",
      companyCategory: "Union Government Company",
      incorporationDate: "1975-10-01",
      companyStatus: "ACTIVE",
      authorizedCapitalInr: 100000000,
    },
  },

  // Additional Valid Test CIN
  "L01111JH2010PLC014523": {
    status: "VERIFIED",
    details: {
      cin: "L01111JH2010PLC014523",
      companyName: "Jamshedpur Advanced Castings Limited",
      registrationNumber: "014523",
      roc: "ROC Jharkhand",
      companyCategory: "Public Limited Listed Company",
      incorporationDate: "2010-02-11",
      companyStatus: "ACTIVE",
      authorizedCapitalInr: 200000000,
    },
  },

  // Explicit Negative Test CIN
  "U99999XX9999PTC999999": {
    status: "REJECTED",
    reason: "Company status is STRUCK_OFF / DISSOLVED under Section 248 of Companies Act",
  },
};

// ============================================================================
// 3. Deterministic Udyam MSME Dataset
// ============================================================================

export const MOCK_UDYAM_REGISTRY: Record<string, { status: "VERIFIED" | "REJECTED"; details?: UdyamDetails; reason?: string }> = {
  // 5 Valid Udyam MSME entries
  "UDYAM-JH-01-0012345": {
    status: "VERIFIED",
    details: {
      udyamNumber: "UDYAM-JH-01-0012345",
      enterpriseName: "Ranchi Precision Engineering MSME",
      enterpriseType: "SMALL",
      majorActivity: "MANUFACTURING",
      state: "Jharkhand",
      district: "Ranchi",
      registrationDate: "2021-04-10",
      enterpriseStatus: "ACTIVE",
    },
  },
  "UDYAM-JH-02-0023456": {
    status: "VERIFIED",
    details: {
      udyamNumber: "UDYAM-JH-02-0023456",
      enterpriseName: "Jamshedpur Heavy Tooling Works",
      enterpriseType: "MEDIUM",
      majorActivity: "MANUFACTURING",
      state: "Jharkhand",
      district: "East Singhbhum",
      registrationDate: "2020-11-19",
      enterpriseStatus: "ACTIVE",
    },
  },
  "UDYAM-JH-03-0034567": {
    status: "VERIFIED",
    details: {
      udyamNumber: "UDYAM-JH-03-0034567",
      enterpriseName: "Dhanbad Coalfield Automation Pvt Ltd",
      enterpriseType: "SMALL",
      majorActivity: "SERVICES",
      state: "Jharkhand",
      district: "Dhanbad",
      registrationDate: "2022-01-15",
      enterpriseStatus: "ACTIVE",
    },
  },
  "UDYAM-JH-04-0045678": {
    status: "VERIFIED",
    details: {
      udyamNumber: "UDYAM-JH-04-0045678",
      enterpriseName: "Bokaro Polymer & Bio-Packaging",
      enterpriseType: "MICRO",
      majorActivity: "MANUFACTURING",
      state: "Jharkhand",
      district: "Bokaro",
      registrationDate: "2023-06-22",
      enterpriseStatus: "ACTIVE",
    },
  },
  "UDYAM-JH-05-0056789": {
    status: "VERIFIED",
    details: {
      udyamNumber: "UDYAM-JH-05-0056789",
      enterpriseName: "Chotanagpur Herbal Agro Processing",
      enterpriseType: "MICRO",
      majorActivity: "MANUFACTURING",
      state: "Jharkhand",
      district: "Ranchi",
      registrationDate: "2021-09-08",
      enterpriseStatus: "ACTIVE",
    },
  },

  // Explicit Negative Test Codes
  "UDYAM-XX-99-9999999": {
    status: "REJECTED",
    reason: "Udyam registration is cancelled or flagged for non-compliance",
  },
};

// ============================================================================
// 4. MockVerificationProvider Implementation
// ============================================================================

export class MockVerificationProvider implements VerificationProvider {
  async verifyAisheCode(code: string): Promise<AisheVerificationResult> {
    const normalized = code.trim().toUpperCase();
    const entry = MOCK_AISHE_REGISTRY[normalized];
    const timestamp = new Date().toISOString();

    if (!entry) {
      return {
        verified: false,
        status: "NOT_FOUND",
        source: "CONTROLLED_MOCK_MVP",
        isOfficialLiveApi: false,
        badge: "Controlled Mock (MVP)",
        verifiedAt: timestamp,
        message: `AISHE code '${code}' not found in educational institution registry`,
      };
    }

    if (entry.status === "REJECTED") {
      return {
        verified: false,
        status: "REJECTED",
        source: "CONTROLLED_MOCK_MVP",
        isOfficialLiveApi: false,
        badge: "Controlled Mock (MVP)",
        verifiedAt: timestamp,
        message: entry.reason ?? "AISHE code failed accreditation or institutional validation checks",
      };
    }

    return {
      verified: true,
      status: "VERIFIED",
      source: "CONTROLLED_MOCK_MVP",
      isOfficialLiveApi: false,
      badge: "Controlled Mock (MVP)",
      verifiedAt: timestamp,
      message: "Institution successfully verified via AISHE database",
      details: entry.details,
    };
  }

  async verifyMcaCin(cin: string): Promise<McaCinVerificationResult> {
    const normalized = cin.trim().toUpperCase();
    const entry = MOCK_MCA_REGISTRY[normalized];
    const timestamp = new Date().toISOString();

    if (!entry) {
      return {
        verified: false,
        status: "NOT_FOUND",
        source: "CONTROLLED_MOCK_MVP",
        isOfficialLiveApi: false,
        badge: "Controlled Mock (MVP)",
        verifiedAt: timestamp,
        message: `Corporate Identification Number (CIN) '${cin}' not found in MCA registry`,
      };
    }

    if (entry.status === "REJECTED") {
      return {
        verified: false,
        status: "REJECTED",
        source: "CONTROLLED_MOCK_MVP",
        isOfficialLiveApi: false,
        badge: "Controlled Mock (MVP)",
        verifiedAt: timestamp,
        message: entry.reason ?? "Company status is inactive or struck off in MCA records",
      };
    }

    return {
      verified: true,
      status: "VERIFIED",
      source: "CONTROLLED_MOCK_MVP",
      isOfficialLiveApi: false,
      badge: "Controlled Mock (MVP)",
      verifiedAt: timestamp,
      message: "Company successfully verified via MCA registry",
      details: entry.details,
    };
  }

  async verifyUdyamNumber(udyamNumber: string): Promise<UdyamVerificationResult> {
    const normalized = udyamNumber.trim().toUpperCase();
    const entry = MOCK_UDYAM_REGISTRY[normalized];
    const timestamp = new Date().toISOString();

    if (!entry) {
      return {
        verified: false,
        status: "NOT_FOUND",
        source: "CONTROLLED_MOCK_MVP",
        isOfficialLiveApi: false,
        badge: "Controlled Mock (MVP)",
        verifiedAt: timestamp,
        message: `Udyam registration number '${udyamNumber}' not found in MSME national portal`,
      };
    }

    if (entry.status === "REJECTED") {
      return {
        verified: false,
        status: "REJECTED",
        source: "CONTROLLED_MOCK_MVP",
        isOfficialLiveApi: false,
        badge: "Controlled Mock (MVP)",
        verifiedAt: timestamp,
        message: entry.reason ?? "Udyam registration certificate is cancelled or flagged",
      };
    }

    return {
      verified: true,
      status: "VERIFIED",
      source: "CONTROLLED_MOCK_MVP",
      isOfficialLiveApi: false,
      badge: "Controlled Mock (MVP)",
      verifiedAt: timestamp,
      message: "Enterprise successfully verified via Udyam MSME portal",
      details: entry.details,
    };
  }
}

export const verificationProvider: VerificationProvider = new MockVerificationProvider();
