export interface ValidationResult {
  score: number;
  issues: string[];
  breakdown: {
    structure: number;
    seo: number;
    content: number;
  };
}
