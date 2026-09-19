import { IconBrandGithub } from "@tabler/icons-react";
import {
  FolderOpen,
  HelpCircle,
  ImageIcon,
  Moon,
  Plus,
  Save,
  Sun,
  Trash2,
} from "lucide-react";

export interface ShortcutConfig {
  alt?: boolean;
  category: string;
  ctrl?: boolean;
  description: string;
  key: string;
  shift?: boolean;
}

export interface CommandConfig {
  category: string;
  description: string;
  icon: any;
  id: string;
  label: string;
  shortcut?: ShortcutConfig;
}

// Note: Avoiding browser conflicts:
// - Ctrl+T (new tab)
// - Ctrl+Shift+N (incognito window)
// - Ctrl+W (close tab)
// - Ctrl+N (new window)
export const SHORTCUT_CONFIGS = {
  BROWSE_PROJECTS: {
    category: "Project",
    ctrl: true,
    description: "Browse projects",
    key: "o",
  },
  COMMAND_PALETTE: {
    category: "General",
    ctrl: true,
    description: "Open command palette",
    key: "k",
  },
  EXPORT_PNG: {
    category: "Export",
    ctrl: true,
    description: "Export as PNG",
    key: "e",
    shift: true,
  },
  KEYBOARD_SHORTCUTS: {
    category: "General",
    ctrl: true,
    description: "Show keyboard shortcuts",
    key: "/",
  },
  NEW_PROJECT: {
    category: "Project",
    ctrl: true,
    description: "New project",
    key: "p",
    shift: true,
  },
  SAVE_PROJECT: {
    category: "Project",
    ctrl: true,
    description: "Save project",
    key: "s",
  },
  SEARCH_TABLES: {
    category: "Navigation",
    ctrl: true,
    description: "Search tables",
    key: "f",
    shift: true,
  },
  TOGGLE_THEME: {
    category: "General",
    ctrl: true,
    description: "Toggle theme (dark/light)",
    key: "d",
    shift: true,
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
  setShowHelpDialog: (show: boolean) => void
): CommandConfig[] {
  return [
    {
      category: "General",
      description: "Switch between light and dark mode",
      icon: theme === "dark" ? Sun : Moon,
      id: "toggle-theme",
      label: "Toggle Theme",
      shortcut: SHORTCUT_CONFIGS.TOGGLE_THEME,
    },
    {
      category: "Project",
      description: "Create a new project",
      icon: Plus,
      id: "new-project",
      label: "New Project",
      shortcut: SHORTCUT_CONFIGS.NEW_PROJECT,
    },
    {
      category: "Project",
      description: "Save current project",
      icon: Save,
      id: "save-project",
      label: "Save Project",
      shortcut: SHORTCUT_CONFIGS.SAVE_PROJECT,
    },
    {
      category: "Project",
      description: "Open project browser",
      icon: FolderOpen,
      id: "browse-projects",
      label: "Browse Projects",
      shortcut: SHORTCUT_CONFIGS.BROWSE_PROJECTS,
    },
    {
      category: "Project",
      description: "Delete current project",
      icon: Trash2,
      id: "delete-project",
      label: "Delete Project",
    },
    {
      category: "Export",
      description: "Export diagram as PNG image",
      icon: ImageIcon,
      id: "export-png",
      label: "Export as PNG",
      shortcut: SHORTCUT_CONFIGS.EXPORT_PNG,
    },
    {
      category: "Export",
      description: "Export diagram as JPEG image",
      icon: ImageIcon,
      id: "export-jpeg",
      label: "Export as JPEG",
    },
    {
      category: "Export",
      description: "Export diagram as SVG vector",
      icon: ImageIcon,
      id: "export-svg",
      label: "Export as SVG",
    },
    {
      category: "Help",
      description: "View all keyboard shortcuts",
      icon: HelpCircle,
      id: "help",
      label: "Keyboard Shortcuts",
      shortcut: SHORTCUT_CONFIGS.KEYBOARD_SHORTCUTS,
    },
    {
      category: "Help",
      description: "Visit the GitHub repository",
      icon: IconBrandGithub,
      id: "github",
      label: "Open GitHub",
    },
  ];
}
