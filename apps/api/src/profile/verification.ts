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

  if (ACADEMIC_DOMAINS[domain]) return true;

  // General academic suffixes
  return (
    domain.endsWith(".ac.zw") ||
    domain.endsWith(".edu.zw") ||
    domain.endsWith(".ac.za") ||
    domain.endsWith(".ac.uk") ||
    domain.endsWith(".edu") ||
    domain.includes(".edu.") ||
    domain.includes(".ac.")
  );
}

/**
 * Retrieves a human-readable institution name from an academic email domain.
 */
export function getInstitutionName(email: string | null | undefined, custom?: string): string {
  if (custom && custom.trim()) return custom.trim();
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
 * Determines appropriate verification level based on primary email.
 */
export function computeVerificationLevel(email: string | null | undefined): VerificationLevel {
  if (!email || !email.trim()) return "unverified";
  if (isAcademicEmail(email)) return "student_verified";
  return "email_verified";
}

/**
 * Evaluates student verification input.
 */
export function verifyStudentCredentials(input: {
  studentEmail: string;
  studentId?: string;
  institution?: string;
}): {
  verified: boolean;
  level: VerificationLevel;
  institution: string;
  message: string;
} {
  const email = input.studentEmail.trim().toLowerCase();
  if (!isAcademicEmail(email)) {
    return {
      verified: false,
      level: "email_verified",
      institution: "Unrecognized Institution",
      message: "The provided email is not a recognized university or academic domain (.ac.zw, .edu, etc.). Please use your official student email address.",
    };
  }

  const institution = getInstitutionName(email, input.institution);
  const idNote = input.studentId ? ` (Student ID: ${input.studentId.trim().toUpperCase()})` : "";

  return {
    verified: true,
    level: "student_verified",
    institution,
    message: `Student status successfully verified for ${institution}${idNote}! You now have campus-verified standing across all discovery cards and events.`,
  };
}
