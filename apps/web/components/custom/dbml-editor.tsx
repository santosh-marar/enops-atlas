"use client";

import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { type Diagnostic, linter, lintGutter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { SAMPLE_DBML } from "@/data/sample-dbml";
import { db } from "@/lib/db";
import { useSchemaStore } from "@/store/use-schema-store";
import { validateDBML } from "@/validation/dbml-editor";

// DBML StreamLanguage
const KEYWORDS = new Set([
  "Table",
  "Ref",
  "Enum",
  "TableGroup",
  "Project",
  "Note",
  "pk",
  "null",
  "not",
  "unique",
  "increment",
  "default",
  "note",
  "ref",
  "delete",
  "update",
  "indexes",
  "CASCADE",
  "SET",
  "RESTRICT",
  "NO",
  "ACTION",
  "primary",
  "key",
]);
const TYPE_KEYWORDS = new Set([
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
]);

const dbmlLanguage = StreamLanguage.define({
  name: "dbml",
  token(stream) {
    if (stream.match("//")) {
      stream.skipToEnd();
      return "lineComment";
    }
    if (stream.match("/*")) {
      while (!stream.eol()) {
        if (stream.match("*/")) break;
        stream.next();
      }
      return "blockComment";
    }
    if (stream.match(/"([^"\\]|\\.)*"/)) return "string";
    if (stream.match(/'([^'\\]|\\.)*'/)) return "string";
    if (stream.match(/`([^`\\]|\\.)*`/)) return "string";
    if (stream.match(/\d+(\.\d+)?/)) return "number";
    if (stream.match(/[{}()[\]]/)) return "bracket";
    if (stream.match(/[<>-]/)) return "operator";
    if (stream.match(/[a-zA-Z_]\w*/)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return "keyword";
      if (TYPE_KEYWORDS.has(word)) return "typeName";
      return "variableName";
    }
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "//" } },
});

// Themes
const zincDarkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#27272a",
      color: "#e4e4e7",
      height: "100%",
      fontSize: "14px",
    },
    ".cm-content": {
      padding: "16px 0",
      caretColor: "#e4e4e7",
      lineHeight: "20px",
    },
    ".cm-cursor": { borderLeftColor: "#e4e4e7" },
    ".cm-selectionBackground, ::selection": { backgroundColor: "#52525b" },
    ".cm-activeLine": { backgroundColor: "#3f3f4640" },
    ".cm-activeLineGutter": { backgroundColor: "#3f3f4640" },
    ".cm-gutters": {
      backgroundColor: "#27272a",
      color: "#52525b",
      borderRight: "1px solid #3f3f46",
    },
    ".cm-lineNumbers .cm-gutterElement": { paddingRight: "12px" },
    ".cm-activeLineGutter.cm-lineNumbers": { color: "#a1a1aa" },
    ".cm-bracketMatching": {
      backgroundColor: "#3f3f46",
      outline: "1px solid #71717a",
    },
    ".cm-tooltip": {
      backgroundColor: "#3f3f46",
      border: "1px solid #52525b",
      color: "#e4e4e7",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "#52525b",
    },
    ".cm-lintRange-error": {
      backgroundImage: "none",
      borderBottom: "2px solid #ef4444",
    },
    ".cm-lintRange-warning": {
      backgroundImage: "none",
      borderBottom: "2px dashed #f59e0b",
    },
  },
  { dark: true }
);

const zincDarkHighlight = HighlightStyle.define([
  { tag: tags.lineComment, color: "#71717a", fontStyle: "italic" },
  { tag: tags.blockComment, color: "#71717a", fontStyle: "italic" },
  { tag: tags.keyword, color: "#c084fc" },
  { tag: tags.typeName, color: "#67e8f9" },
  { tag: tags.variableName, color: "#e4e4e7" },
  { tag: tags.string, color: "#86efac" },
  { tag: tags.number, color: "#fb923c" },
  { tag: tags.operator, color: "#94a3b8" },
  { tag: tags.bracket, color: "#e4e4e7" },
]);

const lightTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px" },
  ".cm-content": { padding: "16px 0", lineHeight: "20px" },
});

const lightHighlight = HighlightStyle.define([
  { tag: tags.lineComment, color: "#008000", fontStyle: "italic" },
  { tag: tags.blockComment, color: "#008000", fontStyle: "italic" },
  { tag: tags.keyword, color: "#0000ff" },
  { tag: tags.typeName, color: "#267f99" },
  { tag: tags.string, color: "#a31515" },
  { tag: tags.number, color: "#098658" },
  { tag: tags.operator, color: "#000000" },
]);

// Completions
const dbmlCompletions = autocompletion({
  override: [
    (ctx) => {
      const word = ctx.matchBefore(/\w*/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;
      return {
        from: word.from,
        options: [
          {
            label: "Table",
            type: "keyword",
            detail: "Create a new table",
            apply: "Table table_name {\n  id integer [pk, increment]\n  \n}",
          },
          {
            label: "Ref",
            type: "keyword",
            detail: "Foreign key reference",
            apply: "Ref: table1.field1 > table2.field2",
          },
          {
            label: "Enum",
            type: "keyword",
            detail: "Define an enum type",
            apply: "Enum enum_name {\n  value1\n  value2\n}",
          },
          ...Array.from(TYPE_KEYWORDS).map((kw) => ({
            label: kw,
            type: "type" as const,
          })),
          ...Array.from(KEYWORDS).map((kw) => ({
            label: kw,
            type: "keyword" as const,
          })),
        ],
      };
    },
  ],
});

// Linter — wraps existing validateDBML
function dbmlLinter() {
  return linter(async (view) => {
    const code = view.state.doc.toString();
    let result: Awaited<ReturnType<typeof validateDBML>>;
    try {
      result = await validateDBML(code);
    } catch {
      return [];
    }
    const diagnostics: Diagnostic[] = result.errors.map((err) => {
      const line = view.state.doc.line(Math.max(1, err.line));
      const from = line.from + Math.max(0, err.column - 1);
      const to = Math.min(line.to, from + 30);
      return {
        from,
        to,
        severity: err.severity === "error" ? "error" : "warning",
        message: err.message,
      };
    });
    return diagnostics;
  });
}

// Component
export default function DBMLEditor() {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isUpdatingStoreRef = useRef(false);

  const { updateFromDBML, dbml } = useSchemaStore();

  // Seed store on first mount
  useEffect(() => {
    const init = async () => {
      const projectId = localStorage.getItem("current_project_id");

      if (projectId) {
        const project = await db.projects.get(projectId);
        if (project?.dbml) {
          updateFromDBML(project.dbml);
          return;
        }
      }

      // No project or no dbml in db — fall back to sample
      if (!dbml || dbml.trim() === "") {
        updateFromDBML(SAMPLE_DBML);
      }
    };

    init();
  }, []);

  // Build / rebuild editor when theme changes
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = theme === "dark";
    const initialContent =
      viewRef.current?.state.doc.toString() ?? dbml ?? SAMPLE_DBML;

    viewRef.current?.destroy();

    // Auto-save to store when valid (fires after linter runs)
    const autoSaveListener = EditorView.updateListener.of(async (update) => {
      if (!update.docChanged || isUpdatingStoreRef.current) return;
      const value = update.state.doc.toString();
      try {
        const result = await validateDBML(value);
        if (result.isValid && value) {
          const currentStoreDbml = useSchemaStore.getState().dbml;
          const isUpdating = useSchemaStore.getState().isUpdating;
          if (value !== currentStoreDbml && !isUpdating) {
            isUpdatingStoreRef.current = true;
            try {
              await updateFromDBML(value, true);
            } finally {
              setTimeout(() => {
                isUpdatingStoreRef.current = false;
              }, 200);
            }
          }
        }
      } catch {
        /* silent — invalid DBML mid-type is expected */
      }
    });

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        drawSelection(),
        lintGutter(),
        dbmlLanguage,
        isDark
          ? [zincDarkTheme, syntaxHighlighting(zincDarkHighlight)]
          : [lightTheme, syntaxHighlighting(lightHighlight)],
        dbmlCompletions,
        dbmlLinter(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
        ]),
        EditorView.lineWrapping,
        autoSaveListener,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    view.focus();

    return () => view.destroy();
  }, [theme]);

  // Sync store → editor (e.g. AI accept/reject, external dbml reset)
  useEffect(() => {
    if (!viewRef.current || isUpdatingStoreRef.current) return;
    const editorValue = viewRef.current.state.doc.toString();
    if (dbml !== editorValue) {
      isUpdatingStoreRef.current = true;
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: dbml ?? "",
        },
      });
      setTimeout(() => {
        isUpdatingStoreRef.current = false;
      }, 200);
    }
  }, [dbml]);

  return <div className="h-full flex-1 font-mono" ref={containerRef} />;
}
