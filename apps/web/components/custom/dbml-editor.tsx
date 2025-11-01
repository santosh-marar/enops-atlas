"use client";

import { useEffect, useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { SAMPLE_DBML } from "@/data/sample-dbml";
import { ValidationError } from "next/dist/compiled/amphtml-validator";
import { validateDBML } from "@/validation/dbml-editor";

export default function DBMLEditor() {
  const { theme } = useTheme();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const [localDBML, setLocalDBML] = useState(SAMPLE_DBML);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [isValid, setIsValid] = useState(true);
  const [isValidating, setIsValidating] = useState(false);

  // If any errors, show them in editor after 1 second
  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsValidating(true);

      try {
        const result = await validateDBML(localDBML);
        setIsValid(result.isValid);
        setValidationErrors(result.errors);

        // Update Monaco inline error markers (red squiggly lines)
        if (editorRef.current && monacoRef.current) {
          const model = editorRef.current.getModel();
          if (model) {
            const markers = result.errors.map((err) => ({
              severity:
                err.severity === "error"
                  ? monacoRef.current.MarkerSeverity.Error
                  : monacoRef.current.MarkerSeverity.Warning,
              startLineNumber: err.line,
              startColumn: err.column,
              endLineNumber: err.line,
              endColumn: Math.min(
                model.getLineLength(err.line) + 1,
                err.column + 30
              ),
              message: err.message,
            }));
            monacoRef.current.editor.setModelMarkers(model, "dbml", markers);
          }
        }
      } catch (err) {
        console.error("Validation error:", err);
      } finally {
        setIsValidating(false);
      }
    }, 1000); // 1s debounce for better performance

    return () => clearTimeout(timer);
  }, [localDBML]);


  // Monaco editor setup with DBML language support
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register DBML as a language
    monaco.languages.register({ id: "dbml" });

    // Syntax highlighting for DBML
    monaco.languages.setMonarchTokensProvider("dbml", {
      keywords: [
        "Table",
        "Ref",
        "Enum",
        "TableGroup",
        "Project",
        "Note",
        "pk",
        "primary key",
        "null",
        "not null",
        "unique",
        "increment",
        "default",
        "note",
        "ref",
        "delete",
        "update",
        "indexes",
        "CASCADE",
        "SET NULL",
        "RESTRICT",
        "NO ACTION",
        "SET DEFAULT",
      ],
      typeKeywords: [
        "integer",
        "int",
        "bigint",
        "smallint",
        "tinyint",
        "varchar",
        "char",
        "text",
        "string",
        "decimal",
        "numeric",
        "float",
        "double",
        "real",
        "money",
        "boolean",
        "bool",
        "bit",
        "date",
        "datetime",
        "timestamp",
        "time",
        "enum",
        "json",
        "jsonb",
        "uuid",
        "blob",
        "binary",
      ],
      operators: ["<", ">", "-", "<>"],
      symbols: /[<>-]/,

      tokenizer: {
        root: [
          [
            /[a-zA-Z_]\w*/,
            {
              cases: {
                "@keywords": "keyword",
                "@typeKeywords": "type",
                "@default": "identifier",
              },
            },
          ],
          [/"([^"\\]|\\.)*"/, "string"],
          [/'([^'\\]|\\.)*'/, "string"],
          [/`([^`\\]|\\.)*`/, "string.escape"],
          [/\d+(\.\d+)?/, "number"],
          [/[{}()\[\]]/, "@brackets"],
          [
            /@symbols/,
            {
              cases: {
                "@operators": "operator",
                "@default": "",
              },
            },
          ],
          [/\/\/.*$/, "comment"],
          [/\/\*/, "comment", "@comment"],
        ],
        comment: [
          [/[^/*]+/, "comment"],
          [/\*\//, "comment", "@pop"],
          [/[/*]/, "comment"],
        ],
      },
    });

    // Autocomplete snippets
    monaco.languages.registerCompletionItemProvider("dbml", {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        return {
          suggestions: [
            {
              label: "Table",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText:
                "Table ${1:table_name} {\n  ${2:id} ${3:integer} [pk, increment]\n  $0\n}",
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: "Create a new table",
              range,
            },
            {
              label: "Ref",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText:
                "Ref: ${1:table1}.${2:field1} > ${3:table2}.${4:field2}",
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: "Create a foreign key reference",
              range,
            },
            {
              label: "Enum",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText:
                "Enum ${1:enum_name} {\n  ${2:value1}\n  ${3:value2}\n}",
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: "Define an enum type",
              range,
            },
          ],
        };
      },
    });

    editor.focus();
  };

  const errorCount = validationErrors.filter(
    (e) => e.severity === "error"
  ).length;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">DBML Editor</span>

          {/* Status Badge */}
          {isValidating ? (
            <span className="text-xs px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full flex items-center gap-1.5">
              <svg
                className="w-3 h-3 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Validating
            </span>
          ) : isValid ? (
            <span className="text-xs px-2.5 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Valid
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 bg-red-500/10 text-red-600 dark:text-red-400 rounded-full flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {errorCount} Error{errorCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Error Panel */}
      {validationErrors.length > 0 && (
        <div className="border-b bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 max-h-48 overflow-y-auto">
          <div className="px-4 py-3 space-y-2">
            {validationErrors.map((err, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 text-sm hover:bg-white dark:hover:bg-red-900/20 p-2 rounded transition-colors"
              >
                <span
                  className={`font-mono text-xs font-semibold shrink-0 ${
                    err.severity === "error"
                      ? "text-red-600 dark:text-red-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {err.severity === "error" ? "❌" : "⚠️"} Line {err.line}:
                  {err.column}
                </span>
                <p
                  className={`flex-1 ${
                    err.severity === "error"
                      ? "text-red-700 dark:text-red-300"
                      : "text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {err.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="dbml"
          theme={theme === "dark" ? "vs-dark" : "vs"}
          value={localDBML}
          onChange={(value) => value !== undefined && setLocalDBML(value)}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16, bottom: 16 },
            tabSize: 2,
            wordWrap: "on",
            fontFamily: "ui-monospace, monospace",
            fontLigatures: true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            autoClosingBrackets: "always",
            autoClosingQuotes: "always",
            formatOnPaste: true,
          }}
          onMount={handleEditorDidMount}
        />
      </div>
    </div>
  );
}
