
export enum Severity {
  CRITICAL = 'CRITICAL',
  MAJOR = 'MAJOR',
  MINOR = 'MINOR',
  OBSERVATION = 'OBSERVATION'
}

export interface AnalysisResult {
  standard: string;
  clause: string;
  finding: string;
  severity: Severity;
  recommendation: string;
}

export interface DocumentSummary {
  overallScore: number;
  criticalIssues: number;
  majorIssues: number;
  minorIssues: number;
  findings: AnalysisResult[];
  complianceProgress: {
    iatf: number;
    iso14001: number;
  };
}

export interface UploadedFile {
  name: string;
  text: string;
}
