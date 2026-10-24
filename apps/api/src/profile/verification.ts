import type { VerificationLevel } from "@sp/types";

const ACADEMIC_DOMAINS: Record<string, string> = {
  "students.nust.ac.zw": "National University of Science and Technology (NUST)",
  "nust.ac.zw": "National University of Science and Technology (NUST)",
  "students.uz.ac.zw": "University of Zimbabwe",
  "uz.ac.zw": "University of Zimbabwe",
  "msu.ac.zw": "Midlands State University",
  "cut.ac.zw": "Chinhoyi University of Technology",
  "gzu.ac.zw": "Great Zimbabwe University",
  "hit.ac.zw": "Harare Institute of Technology",
  "buse.ac.zw": "Bindura University of Science Education",
  "lsu.ac.zw": "Lupane State University",
  "africau.edu": "Africa University",
  "solusi.ac.zw": "Solusi University",
  "cuz.ac.zw": "Catholic University in Zimbabwe",
  "wsu.ac.za": "Walter Sisulu University",
  "uct.ac.za": "University of Cape Town",
  "wits.ac.za": "University of the Witwatersrand",
  "up.ac.za": "University of Pretoria",
  "uj.ac.za": "University of Johannesburg",
};

/**
 * Checks whether an email address belongs to a recognized university or academic domain.
 */
export function isAcademicEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  const atIndex = lower.indexOf("@");
  if (atIndex === -1) return false;
  const domain = lower.slice(atIndex + 1);
  if (!domain) return false;

  return Object.hasOwn(ACADEMIC_DOMAINS, domain);
}

/**
 * Retrieves a human-readable institution name from an academic email domain.
 */
export function getInstitutionName(email: string | null | undefined, custom?: string): string {
  // Institution labels come from the allowlist, never a user-supplied claim.
  void custom;
  if (!email) return "Campus Community";
  const lower = email.trim().toLowerCase();
  const domain = lower.split("@")[1] ?? "";
  if (ACADEMIC_DOMAINS[domain]) return ACADEMIC_DOMAINS[domain];
  if (domain.endsWith(".ac.zw") || domain.endsWith(".edu.zw")) return "Zimbabwe University";
  if (domain.endsWith(".ac.za")) return "South African University";
  if (domain.endsWith(".edu")) return "University Campus";
  return "Academic Community";
}

/**
 * Evaluates student verification input.
 */
export function verifyStudentCredentials(input: {
  studentEmail: string;
  studentId?: string;
  institution?: string;
}, verifiedEmail: string | null): {
  verified: boolean;
  level: VerificationLevel;
  institution: string;
  message: string;
} {
  const email = input.studentEmail.trim().toLowerCase();
  if (!verifiedEmail || email !== verifiedEmail.trim().toLowerCase()) {
    return { verified: false, level: "unverified", institution: "Unverified", message: "Confirm your university sign-in email first. Older auto-confirmed accounts must use a fresh email access link; the address must match your sign-in email. Accounts with a phone identity must confirm an email change instead." };
  }
  if (!isAcademicEmail(email)) {
    return {
      verified: false,
      level: "unverified",
      institution: "Unrecognized Institution",
      message: "The provided email is not a recognized university or academic domain on the supported institution list. Please use your official student email address.",
    };
  }

  const institution = getInstitutionName(email, input.institution);


  return {
    verified: true,
    level: "student_verified",
    institution,
    message: `Academic email ownership confirmed for ${institution}. This verifies email access, not current enrollment or personal identity.`,
  };
}
