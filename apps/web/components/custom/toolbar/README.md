# Toolbar Components

This directory contains modular components for the top toolbar.

## Structure

- **action-menu.tsx**: Dropdown menu for project actions (New, Browse, Delete, Export)
- **export-loading-overlay.tsx**: Loading overlay shown during image export
- **project-name-editor.tsx**: Inline editor for project name
- **project-dialogs.tsx**: All project-related dialogs (Browse, New, Delete)

## Related Files

- **hooks/use-project-manager.ts**: Custom hook for project CRUD operations
- **hooks/use-image-export.ts**: Custom hook for image export functionality
- **lib/shortcuts-config.ts**: Centralized keyboard shortcuts configuration

## Keyboard Shortcuts (Fixed for Browser Compatibility)

| Shortcut | Action | Notes |
|----------|--------|-------|
| Ctrl+K | Command Palette | - |
| Ctrl+/ | Keyboard Shortcuts | - |
| Ctrl+Shift+D | Toggle Theme | Changed from Ctrl+T (browser conflict) |
| Ctrl+S | Save Project | - |
| Ctrl+Shift+P | New Project | Changed from Ctrl+Shift+N (browser conflict) |
| Ctrl+O | Browse Projects | - |
| Ctrl+Shift+E | Export PNG | - |