export interface MindMapNode {
  id: string;
  text: string;
  children: string[];
  parentId: string | null;
  isExpanded?: boolean;
  position: { x: number; y: number };
}

export interface MindMapProject {
  id: string;
  title: string;
  rootId: string;
  nodes: Record<string, MindMapNode>;
  updatedAt: number;
  createdAt: number;
}

export interface MindMapStore {
  projects: Record<string, MindMapProject>;
  currentProjectId: string;
}

export interface Point {
  x: number;
  y: number;
}

