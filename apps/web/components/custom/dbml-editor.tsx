"use client";

import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { SAMPLE_DBML } from "@/data/sample-dbml";
import { useSchemaStore } from "@/store/use-schema-store";
import { type ValidationError, validateDBML } from "@/validation/dbml-editor";

export default function DBMLEditor() {
  const { theme } = useTheme();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const [localDBML, setLocalDBML] = useState(SAMPLE_DBML);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [isValidating, setIsValidating] = useState(false);

  const { updateFromDBML, dbml } = useSchemaStore();

  // Seed store on first mount if empty
  useEffect(() => {
    const hasProject = localStorage.getItem("enops-dev-last-project-id");
    if (!hasProject && (!dbml || dbml.trim() === "")) {
      updateFromDBML(SAMPLE_DBML);
    }
  }, []);

  useEffect(() => {
    if (dbml !== localDBML) {
      setLocalDBML(dbml);
      if (dbml === "") {
        setValidationErrors([]);
      }
    }
  }, [dbml]);

  // Validate + update store, debounced together
  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsValidating(true);
      try {
        const result = await validateDBML(localDBML);
        setValidationErrors(result.errors);

        // Update Monaco inline markers
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

        // Only push to store if valid
        if (result.isValid && localDBML) {
          updateFromDBML(localDBML, true);
        }
      } catch {
        // silent — invalid DBML mid-type is expected
      } finally {
        setIsValidating(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [localDBML, updateFromDBML]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.editor.defineTheme("zinc", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "71717a", fontStyle: "italic" },
        { token: "keyword", foreground: "c084fc" },
        { token: "type", foreground: "67e8f9" },
        { token: "identifier", foreground: "e4e4e7" },
        { token: "string", foreground: "86efac" },
        { token: "string.escape", foreground: "86efac" },
        { token: "number", foreground: "fb923c" },
        { token: "operator", foreground: "94a3b8" },
        { token: "delimiter.bracket", foreground: "e4e4e7" },
        { token: "", foreground: "e4e4e7" },
      ],
      colors: {
        "editor.background": "#27272a",
        "editor.foreground": "#e4e4e7",
        "editor.lineHighlightBackground": "#3f3f46",
        "editor.selectionBackground": "#52525b",
        "editorCursor.foreground": "#e4e4e7",
        "editorLineNumber.foreground": "#52525b",
        "editorLineNumber.activeForeground": "#a1a1aa",
        "editorIndentGuide.background1": "#3f3f46",
        "editorIndentGuide.activeBackground1": "#52525b",
        "editorBracketMatch.background": "#3f3f46",
        "editorBracketMatch.border": "#71717a",
        "scrollbarSlider.background": "#3f3f4680",
        "scrollbarSlider.hoverBackground": "#52525b80",
      },
    });
    monaco.editor.setTheme("zinc");

    monaco.languages.register({ id: "dbml" });

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
          [/[{}()[\]]/, "@brackets"],
          [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],
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

  return (
    <div className="flex h-full flex-col bg-background">
      {validationErrors.length > 0 && (
        <div className="max-h-48 overflow-y-auto border-red-200 border-b bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <div className="space-y-2 px-4 py-3">
            {validationErrors.map((err, idx) => (
              <div
                className="flex items-start gap-3 rounded p-2 text-sm transition-colors hover:bg-white dark:hover:bg-red-900/20"
                key={idx}
              >
                <span
                  className={`shrink-0 font-mono font-semibold text-xs ${
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

      <div className="min-h-0 flex-1">
        <Editor
          className="font-mono"
          defaultLanguage="dbml"
          height="100%"
          onChange={(value) => value !== undefined && setLocalDBML(value)}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineHeight: 20,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16, bottom: 16 },
            tabSize: 2,
            wordWrap: "on",
            fontLigatures: true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            autoClosingBrackets: "always",
            autoClosingQuotes: "always",
            formatOnPaste: true,
          }}
          theme={theme === "dark" ? "zinc" : "vs"}
          value={localDBML}
        />
      </div>
    </div>
  );
}
