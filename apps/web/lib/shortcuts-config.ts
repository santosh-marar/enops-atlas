import {
  Plus,
  Save,
  FolderOpen,
  Trash2,
  ImageIcon,
  HelpCircle,
  Github,
  Search,
  Moon,
  Sun,
} from "lucide-react";

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  category: string;
}

export interface CommandConfig {
  id: string;
  label: string;
  description: string;
  icon: any;
  category: string;
  shortcut?: ShortcutConfig;
}

// Note: Avoiding browser conflicts:
// - Ctrl+T (new tab)
// - Ctrl+Shift+N (incognito window)
// - Ctrl+W (close tab)
// - Ctrl+N (new window)
export const SHORTCUT_CONFIGS = {
  COMMAND_PALETTE: {
    key: "k",
    ctrl: true,
    description: "Open command palette",
    category: "General",
  },
  KEYBOARD_SHORTCUTS: {
    key: "/",
    ctrl: true,
    description: "Show keyboard shortcuts",
    category: "General",
  },
  TOGGLE_THEME: {
    key: "d",
    ctrl: true,
    shift: true,
    description: "Toggle theme (dark/light)",
    category: "General",
  },
  SAVE_PROJECT: {
    key: "s",
    ctrl: true,
    description: "Save project",
    category: "Project",
  },
  NEW_PROJECT: {
    key: "p",
    ctrl: true,
    shift: true,
    description: "New project",
    category: "Project",
  },
  BROWSE_PROJECTS: {
    key: "o",
    ctrl: true,
    description: "Browse projects",
    category: "Project",
  },
  EXPORT_PNG: {
    key: "e",
    ctrl: true,
    shift: true,
    description: "Export as PNG",
    category: "Export",
  },
  SEARCH_TABLES: {
    key: "f",
    ctrl: true,
    shift: true,
    description: "Search tables",
    category: "Navigation",
  },
} as const;

export function createCommands(
  theme: string | undefined,
  setTheme: (theme: string) => void,
  handleNew: () => void,
  handleSave: () => void,
  handleBrowse: () => void,
  handleDelete: () => void,
  handleExportImage: (format: "png" | "jpeg" | "svg") => void,
  setShowHelpDialog: (show: boolean) => void,
): CommandConfig[] {
  return [
    {
      id: "toggle-theme",
      label: "Toggle Theme",
      description: "Switch between light and dark mode",
      icon: theme === "dark" ? Sun : Moon,
      category: "General",
      shortcut: SHORTCUT_CONFIGS.TOGGLE_THEME,
    },
    {
      id: "new-project",
      label: "New Project",
      description: "Create a new project",
      icon: Plus,
      category: "Project",
      shortcut: SHORTCUT_CONFIGS.NEW_PROJECT,
    },
    {
      id: "save-project",
      label: "Save Project",
      description: "Save current project",
      icon: Save,
      category: "Project",
      shortcut: SHORTCUT_CONFIGS.SAVE_PROJECT,
    },
    {
      id: "browse-projects",
      label: "Browse Projects",
      description: "Open project browser",
      icon: FolderOpen,
      category: "Project",
      shortcut: SHORTCUT_CONFIGS.BROWSE_PROJECTS,
    },
    {
      id: "delete-project",
      label: "Delete Project",
      description: "Delete current project",
      icon: Trash2,
      category: "Project",
    },
    {
      id: "export-png",
      label: "Export as PNG",
      description: "Export diagram as PNG image",
      icon: ImageIcon,
      category: "Export",
      shortcut: SHORTCUT_CONFIGS.EXPORT_PNG,
    },
    {
      id: "export-jpeg",
      label: "Export as JPEG",
      description: "Export diagram as JPEG image",
      icon: ImageIcon,
      category: "Export",
    },
    {
      id: "export-svg",
      label: "Export as SVG",
      description: "Export diagram as SVG vector",
      icon: ImageIcon,
      category: "Export",
    },
    {
      id: "help",
      label: "Keyboard Shortcuts",
      description: "View all keyboard shortcuts",
      icon: HelpCircle,
      category: "Help",
      shortcut: SHORTCUT_CONFIGS.KEYBOARD_SHORTCUTS,
    },
    {
      id: "github",
      label: "Open GitHub",
      description: "Visit the GitHub repository",
      icon: Github,
      category: "Help",
    },
  ];
}
