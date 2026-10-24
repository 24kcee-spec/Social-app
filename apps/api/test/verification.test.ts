import { describe, expect, it } from "vitest";
import { getInstitutionName, isAcademicEmail, verifyStudentCredentials } from "../src/profile/verification";

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

  it("accepts only explicitly supported academic domains", () => {
    expect(isAcademicEmail("student@college.ac.zw")).toBe(false);
    expect(isAcademicEmail("user@uct.ac.za")).toBe(true);
    expect(isAcademicEmail("person@mit.edu")).toBe(false);
  });

  it("rejects commercial and personal email providers", () => {
    expect(isAcademicEmail("person@gmail.com")).toBe(false);
    expect(isAcademicEmail("user@yahoo.co.uk")).toBe(false);
    expect(isAcademicEmail("test@outlook.com")).toBe(false);
    expect(isAcademicEmail(null)).toBe(false);
    expect(isAcademicEmail("")).toBe(false);
  });

  it("rejects unproven academic email and domain lookalikes", () => {
    expect(verifyStudentCredentials({ studentEmail: "someone@students.nust.ac.zw" }, null).verified).toBe(false);
    expect(verifyStudentCredentials({ studentEmail: "someone@students.nust.ac.zw" }, "other@students.nust.ac.zw").verified).toBe(false);
    expect(isAcademicEmail("user@college.ac.attacker.example")).toBe(false);
    expect(isAcademicEmail("user@students.nust.ac.zw.attacker.example")).toBe(false);
  });

  it("verifies valid student credentials with institution details", () => {
    const res = verifyStudentCredentials({
      studentEmail: "n02420280y@students.nust.ac.zw",
      studentId: "N02420280Y",
      institution: "Made up institution",
    }, "n02420280y@students.nust.ac.zw");
    expect(res.verified).toBe(true);
    expect(res.level).toBe("student_verified");
    expect(res.institution).toBe("National University of Science and Technology (NUST)");
    expect(res.message).toContain("not current enrollment");
  });

  it("rejects non-academic emails with helpful guidance", () => {
    const res = verifyStudentCredentials({
      studentEmail: "user@gmail.com",
    }, "user@gmail.com");
    expect(res.verified).toBe(false);
    expect(res.level).toBe("unverified");
    expect(res.message).toContain("official student email");
  });
});
