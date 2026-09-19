// Only validates DBML syntax - does not check for errors
// Todo: add semantic validation
export interface ValidationError {
  column: number;
  line: number;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  database?: any;
  errors: ValidationError[];
  isValid: boolean;
}

/**
 * Validates DBML using official @dbml/core parser
 * Returns structured error information with line/column numbers
 */
export const validateDBML = async (dbml: string): Promise<ValidationResult> => {
  // Empty check
  if (!dbml?.trim()) {
    return {
      errors: [
        {
          column: 1,
          line: 1,
          message: "DBML cannot be empty",
          severity: "error",
        },
      ],
      isValid: false,
    };
  }

  try {
    const { Parser } = await import("@dbml/core");
    const parser = new Parser();

    // Parse with dbmlv2 for better error messages
    const database = parser.parse(dbml, "dbmlv2");

    return {
      database,
      errors: [],
      isValid: true,
    };
  } catch (error: any) {
    const errors: ValidationError[] = [];

    try {
      // diags array error format (legacy)
      if (error.diags && Array.isArray(error.diags)) {
        errors.push(
          ...error.diags.map((diag: any) => ({
            column: diag.location?.start?.column || 1,
            line: diag.location?.start?.line || 1,
            message: diag.message || "Syntax error",
            severity: diag.severity === 1 ? "warning" : ("error" as const),
          }))
        );
      } else if (error.location) {
        errors.push({
          column: error.location.start.column,
          line: error.location.start.line,
          message: error.message || "Syntax error",
          severity: "error",
        });
      }
      // Unknown error format - fallback
      else {
        errors.push({
          column: 1,
          line: 1,
          message: error.message || "Invalid DBML syntax",
          severity: "error",
        });
      }
    } catch (parseErr) {
      errors.push({
        column: 1,
        line: 1,
        message: "Failed to parse DBML",
        severity: "error",
      });
    }

    return {
      errors,
      isValid: false,
    };
  }
};
