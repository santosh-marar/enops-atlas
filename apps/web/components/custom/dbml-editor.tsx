"use client";

import { useEffect, useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { SAMPLE_DBML } from "@/data/sample-dbml";
import { ValidationError } from "next/dist/compiled/amphtml-validator";
import { validateDBML } from "@/validation/dbml-editor";
import { useSchemaStore } from "@/store/use-schema-store";

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

  const { updateFromDBML, dbml } = useSchemaStore();

  // Initial sync: Load SAMPLE_DBML on first mount if store is empty
  useEffect(() => {
    if (!dbml || dbml.trim() === "") {
      updateFromDBML(SAMPLE_DBML);
    }
  }, []); // Run only once on mount

  // Sync editor with store when DBML changes externally
  useEffect(() => {
    if (dbml !== localDBML) {
      setLocalDBML(dbml);
      if (dbml === "") {
        setValidationErrors([]);
        setIsValid(true);
      }
    }
  }, [dbml]);

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
        // console.error("Validation error:", err);
      } finally {
        setIsValidating(false);
      }
    }, 1000); // 1s debounce for better performance

    return () => clearTimeout(timer);
  }, [localDBML]);

  useEffect(() => {
    if (!isValid) return;
    if (!localDBML) return;

    const handler = setTimeout(async () => {
      try {
        // Preserve positions when updating from editor
        updateFromDBML(localDBML, true);
      } catch (err) {
        console.error("Failed to apply DBML:", err);
      }
    }, 1000); // debounce: 1 seconds after last change

    // Clear timeout if localDBML changes again within 5s
    return () => clearTimeout(handler);
  }, [localDBML, isValid]);



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
    <div className="h-full flex flex-col bg-background">

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
