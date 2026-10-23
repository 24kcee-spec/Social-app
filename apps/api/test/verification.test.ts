import { describe, expect, it } from "vitest";
import { computeVerificationLevel, getInstitutionName, isAcademicEmail, verifyStudentCredentials } from "../src/profile/verification";

describe("academic student verification engine", () => {
  it("recognizes NUST student emails", () => {
    expect(isAcademicEmail("n02420280y@students.nust.ac.zw")).toBe(true);
    expect(isAcademicEmail("lecturer@nust.ac.zw")).toBe(true);
    expect(getInstitutionName("n02420280y@students.nust.ac.zw")).toBe("National University of Science and Technology (NUST)");
  });

  it("recognizes other Zimbabwean universities", () => {
    expect(isAcademicEmail("student@students.uz.ac.zw")).toBe(true);
    expect(isAcademicEmail("staff@msu.ac.zw")).toBe(true);
    expect(isAcademicEmail("user@hit.ac.zw")).toBe(true);
    expect(isAcademicEmail("user@cut.ac.zw")).toBe(true);
    expect(isAcademicEmail("user@africau.edu")).toBe(true);
  });

  it("recognizes general .ac.zw, .edu, .ac.za academic domains", () => {
    expect(isAcademicEmail("student@college.ac.zw")).toBe(true);
    expect(isAcademicEmail("user@uct.ac.za")).toBe(true);
    expect(isAcademicEmail("person@mit.edu")).toBe(true);
  });

  it("rejects commercial and personal email providers", () => {
    expect(isAcademicEmail("person@gmail.com")).toBe(false);
    expect(isAcademicEmail("user@yahoo.co.uk")).toBe(false);
    expect(isAcademicEmail("test@outlook.com")).toBe(false);
    expect(isAcademicEmail(null)).toBe(false);
    expect(isAcademicEmail("")).toBe(false);
  });

  it("computes verification levels accurately", () => {
    expect(computeVerificationLevel("n02420280y@students.nust.ac.zw")).toBe("student_verified");
    expect(computeVerificationLevel("user@gmail.com")).toBe("email_verified");
    expect(computeVerificationLevel("")).toBe("unverified");
    expect(computeVerificationLevel(null)).toBe("unverified");
  });

  it("verifies valid student credentials with institution details", () => {
    const res = verifyStudentCredentials({
      studentEmail: "n02420280y@students.nust.ac.zw",
      studentId: "N02420280Y",
      institution: "NUST",
    });
    expect(res.verified).toBe(true);
    expect(res.level).toBe("student_verified");
    expect(res.institution).toBe("NUST");
    expect(res.message).toContain("N02420280Y");
  });

  it("rejects non-academic emails with helpful guidance", () => {
    const res = verifyStudentCredentials({
      studentEmail: "user@gmail.com",
    });
    expect(res.verified).toBe(false);
    expect(res.level).toBe("email_verified");
    expect(res.message).toContain("official student email");
  });
});
