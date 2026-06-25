import type { ComponentType } from 'react';

export interface LayoutProps {
  data: Record<string, unknown>;
}

// Noch keine kundenspezifischen PDF-Layouts registriert.
// Ein neues Mondi-Layout wird hier eingetragen:
//   import { MondiLayout } from './layouts/mondi/<name>/index.js';
//   ['mondi.<name>', MondiLayout as ComponentType<LayoutProps>],
// Die DOCX-Pipeline (/api/render) ist davon unabhängig und voll funktionsfähig.
export const layouts = new Map<string, ComponentType<LayoutProps>>([]);
