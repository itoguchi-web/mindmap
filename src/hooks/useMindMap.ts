import { useState, useEffect, useCallback, useMemo } from 'react';
import { nanoid } from 'nanoid';
import { MindMapProject, MindMapNode, MindMapStore } from '../types';

const STORAGE_KEY = 'mindmap-store-v2';

const createNewProject = (title: string = 'New Mind Map'): MindMapProject => {
  const rootId = nanoid();
  return {
    id: nanoid(),
    title,
    rootId,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    nodes: {
      [rootId]: {
        id: rootId,
        text: title,
        children: [],
        parentId: null,
        isExpanded: true,
        position: { x: 0, y: 0 },
      },
    },
  };
};

const INITIAL_STORE: MindMapStore = (() => {
  const defaultProject = createNewProject('Central Topic');
  return {
    projects: { [defaultProject.id]: defaultProject },
    currentProjectId: defaultProject.id,
  };
})();

export function useMindMap() {
  const [store, setStore] = useState<MindMapStore>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.currentProjectId && Object.keys(parsed.projects).length > 0) {
          parsed.currentProjectId = Object.keys(parsed.projects)[0];
        }
        return parsed;
      } catch (e) {
        console.error('Failed to load mindmap store', e);
      }
    }
    return INITIAL_STORE;
  });

  const [history, setHistory] = useState<MindMapStore[]>([]);
  const [redoStack, setRedoStack] = useState<MindMapStore[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const currentProject = useMemo(() => 
    store.projects[store.currentProjectId] || Object.values(store.projects)[0],
    [store]
  );

  useEffect(() => {
    if (!selectedId && currentProject) {
      setSelectedId(currentProject.rootId);
    }
  }, [currentProject, selectedId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  const saveToHistory = useCallback((prevStore: MindMapStore) => {
    setHistory(prev => {
      const newHistory = [prevStore, ...prev];
      return newHistory.slice(0, 20); // Keep last 20 steps
    });
    setRedoStack([]); // Clear redo stack on new action
  }, []);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const [lastState, ...rest] = prev;
      setRedoStack(r => [store, ...r].slice(0, 20));
      setStore(lastState);
      return rest;
    });
  }, [store]);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const [nextState, ...rest] = prev;
      setHistory(h => [store, ...h].slice(0, 20));
      setStore(nextState);
      return rest;
    });
  }, [store]);

  const updateStore = useCallback((updater: (prev: MindMapStore) => MindMapStore) => {
    setStore(prev => {
      const next = updater(prev);
      if (next !== prev) {
        saveToHistory(prev);
      }
      return next;
    });
  }, [saveToHistory]);

  const tidyUp = useCallback(() => {
    setStore((prev) => {
      const project = prev.projects[prev.currentProjectId];
      if (!project) return prev;

      const newNodes = { ...project.nodes };
      const HORIZONTAL_SPACING = 320;
      const VERTICAL_SPACING = 80;

      const estimateNodeHeight = (text: string): number => {
        const charPerLine = 20; // 280px width estimate
        const lineHeight = 24;
        const padding = 20;
        if (!text) return 44;
        const lines = text.split('\n');
        let lineCount = 0;
        lines.forEach(l => {
          lineCount += Math.max(1, Math.ceil(l.length / charPerLine));
        });
        return Math.max(44, lineCount * lineHeight + padding);
      };

      const getSubtreeHeight = (id: string): number => {
        const node = newNodes[id];
        if (!node) return 0;
        const selfHeight = estimateNodeHeight(node.text) + VERTICAL_SPACING;
        if (node.children.length === 0) return selfHeight;
        
        const childrenHeight = node.children.reduce((acc, childId) => acc + getSubtreeHeight(childId), 0);
        return Math.max(selfHeight, childrenHeight);
      };

      const layout = (id: string, x: number, yCenter: number) => {
        const node = newNodes[id];
        if (!node) return;

        newNodes[id] = { ...node, position: { x, y: yCenter } };

        if (node.children.length > 0) {
          const totalHeight = getSubtreeHeight(id);
          const selfHeight = estimateNodeHeight(node.text) + VERTICAL_SPACING;
          
          // Use the larger of self height or children height for layout
          const layoutHeight = Math.max(selfHeight, node.children.reduce((acc, cid) => acc + getSubtreeHeight(cid), 0));
          
          let currentY = yCenter - layoutHeight / 2;

          node.children.forEach(childId => {
            const childSubtreeHeight = getSubtreeHeight(childId);
            layout(childId, x + HORIZONTAL_SPACING, currentY + childSubtreeHeight / 2);
            currentY += childSubtreeHeight;
          });
        }
      };

      layout(project.rootId, -300, 0);

      return {
        ...prev,
        projects: {
          ...prev.projects,
          [prev.currentProjectId]: {
            ...project,
            nodes: newNodes,
            updatedAt: Date.now()
          }
        }
      };
    });
  }, []);

  const updateNode = useCallback((nodeId: string, updates: Partial<MindMapNode>) => {
    updateStore((prev) => {
      const project = prev.projects[prev.currentProjectId];
      if (!project || !project.nodes[nodeId]) return prev;

      return {
        ...prev,
        projects: {
          ...prev.projects,
          [prev.currentProjectId]: {
            ...project,
            updatedAt: Date.now(),
            nodes: {
              ...project.nodes,
              [nodeId]: { ...project.nodes[nodeId], ...updates },
            },
          },
        },
      };
    });
  }, [updateStore]);

  const moveNode = useCallback((nodeId: string, delta: { x: number; y: number }) => {
    setStore((prev) => {
      const project = prev.projects[prev.currentProjectId];
      if (!project) return prev;

      const newNodes = { ...project.nodes };
      const visited = new Set<string>();
      
      const moveRecursive = (id: string) => {
        if (visited.has(id)) return;
        visited.add(id);
        
        const node = newNodes[id];
        if (!node) return;
        
        newNodes[id] = {
          ...node,
          position: {
            x: node.position.x + delta.x,
            y: node.position.y + delta.y,
          },
        };
        
        node.children.forEach(moveRecursive);
      };

      moveRecursive(nodeId);

      return {
        ...prev,
        projects: {
          ...prev.projects,
          [prev.currentProjectId]: {
            ...project,
            updatedAt: Date.now(),
            nodes: newNodes,
          },
        },
      };
    });
  }, []);

  const addChild = useCallback((parentId: string) => {
    const newId = nanoid();
    updateStore((prev) => {
      const project = prev.projects[prev.currentProjectId];
      const parent = project?.nodes[parentId];
      if (!project || !parent) return prev;

      const newNode: MindMapNode = {
        id: newId,
        text: '',
        children: [],
        parentId,
        isExpanded: true,
        position: {
          x: parent.position.x + 240,
          y: parent.position.y,
        },
      };

      return {
        ...prev,
        projects: {
          ...prev.projects,
          [prev.currentProjectId]: {
            ...project,
            updatedAt: Date.now(),
            nodes: {
              ...project.nodes,
              [parentId]: {
                ...parent,
                children: [...parent.children, newId],
              },
              [newId]: newNode,
            },
          },
        },
      };
    });
    tidyUp();
    setTimeout(() => tidyUp(), 50);
    setSelectedId(newId);
    return newId;
  }, [updateStore, tidyUp]);

  const addSibling = useCallback((nodeId: string) => {
    const node = currentProject.nodes[nodeId];
    if (!node || !node.parentId) return null;

    const parentId = node.parentId;
    const newId = nanoid();
    
    updateStore((prev) => {
      const project = prev.projects[prev.currentProjectId];
      const parent = project?.nodes[parentId];
      if (!project || !parent) return prev;

      const nodeIndex = parent.children.indexOf(nodeId);
      const newNode: MindMapNode = {
        id: newId,
        text: '',
        children: [],
        parentId,
        isExpanded: true,
        position: {
          x: node.position.x,
          y: node.position.y + 60,
        },
      };

      const newChildren = [...parent.children];
      newChildren.splice(nodeIndex + 1, 0, newId);

      return {
        ...prev,
        projects: {
          ...prev.projects,
          [prev.currentProjectId]: {
            ...project,
            updatedAt: Date.now(),
            nodes: {
              ...project.nodes,
              [parentId]: { ...parent, children: newChildren },
              [newId]: newNode,
            },
          },
        },
      };
    });

    tidyUp();
    setTimeout(() => tidyUp(), 50);
    setSelectedId(newId);
    return newId;
  }, [currentProject, updateStore, tidyUp]);

  const deleteNode = useCallback((id: string) => {
    if (id === currentProject.rootId) return;

    updateStore((prev) => {
      const project = prev.projects[prev.currentProjectId];
      const node = project?.nodes[id];
      if (!project || !node || !node.parentId) return prev;

      const newNodes = { ...project.nodes };
      const removeRecursive = (targetId: string) => {
        const target = newNodes[targetId];
        if (target) {
          target.children.forEach(removeRecursive);
          delete newNodes[targetId];
        }
      };

      const parent = newNodes[node.parentId];
      if (parent) {
        newNodes[node.parentId] = {
          ...parent,
          children: parent.children.filter((childId) => childId !== id),
        };
      }

      removeRecursive(id);

      return {
        ...prev,
        projects: {
          ...prev.projects,
          [prev.currentProjectId]: {
            ...project,
            updatedAt: Date.now(),
            nodes: newNodes,
          },
        },
      };
    });

    tidyUp();
    setSelectedId(currentProject.nodes[id]?.parentId || currentProject.rootId);
  }, [currentProject, updateStore, tidyUp]);

  const createProject = useCallback((title?: string) => {
    const newProject = createNewProject(title);
    updateStore((prev) => ({
      ...prev,
      projects: { ...prev.projects, [newProject.id]: newProject },
      currentProjectId: newProject.id,
    }));
    tidyUp();
    setSelectedId(newProject.rootId);
  }, [updateStore, tidyUp]);

  const switchProject = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, currentProjectId: id }));
    setSelectedId(null);
    setHistory([]); 
    setTimeout(() => tidyUp(), 0);
  }, [tidyUp]);

  const deleteProject = useCallback((id: string) => {
    updateStore((prev) => {
      const newProjects = { ...prev.projects };
      delete newProjects[id];
      
      const projectIds = Object.keys(newProjects);
      if (projectIds.length === 0) {
        const defaultProject = createNewProject('Central Topic');
        return {
          projects: { [defaultProject.id]: defaultProject },
          currentProjectId: defaultProject.id,
        };
      }

      return {
        ...prev,
        projects: newProjects,
        currentProjectId: prev.currentProjectId === id ? projectIds[0] : prev.currentProjectId,
      };
    });
    tidyUp();
  }, [updateStore, tidyUp]);

  const renameProject = useCallback((id: string, title: string) => {
    updateStore((prev) => {
      const project = prev.projects[id];
      if (!project) return prev;
      
      return {
        ...prev,
        projects: {
          ...prev.projects,
          [id]: { ...project, title },
        },
      };
    });
  }, [updateStore]);

  const reorderNode = useCallback((nodeId: string, newIndex: number) => {
    updateStore((prev) => {
      const project = prev.projects[prev.currentProjectId];
      if (!project) return prev;
      const node = project.nodes[nodeId];
      if (!node || !node.parentId) return prev;

      const parent = project.nodes[node.parentId];
      const newChildren = parent.children.filter(id => id !== nodeId);
      newChildren.splice(Math.max(0, Math.min(newIndex, newChildren.length)), 0, nodeId);

      return {
        ...prev,
        projects: {
          ...prev.projects,
          [prev.currentProjectId]: {
            ...project,
            updatedAt: Date.now(),
            nodes: {
              ...project.nodes,
              [node.parentId]: { ...parent, children: newChildren }
            }
          }
        }
      };
    });
    tidyUp();
  }, [updateStore, tidyUp]);

  const reParentNode = useCallback((nodeId: string, newParentId: string, index?: number) => {
    updateStore((prev) => {
      const project = prev.projects[prev.currentProjectId];
      if (!project || nodeId === newParentId || nodeId === project.rootId) return prev;
      
      const node = project.nodes[nodeId];
      const oldParentId = node.parentId;
      if (!oldParentId) return prev;

      let curr: string | null = newParentId;
      while (curr) {
        if (curr === nodeId) return prev;
        curr = project.nodes[curr].parentId;
      }

      const newNodes = { ...project.nodes };
      
      newNodes[oldParentId] = {
        ...newNodes[oldParentId],
        children: newNodes[oldParentId].children.filter(id => id !== nodeId)
      };

      const targetParent = newNodes[newParentId];
      const newChildren = [...targetParent.children];
      if (typeof index === 'number') {
        newChildren.splice(index, 0, nodeId);
      } else {
        newChildren.push(nodeId);
      }

      newNodes[newParentId] = {
        ...newNodes[newParentId],
        children: newChildren
      };

      newNodes[nodeId] = {
        ...newNodes[nodeId],
        parentId: newParentId
      };

      return {
        ...prev,
        projects: {
          ...prev.projects,
          [prev.currentProjectId]: {
            ...project,
            updatedAt: Date.now(),
            nodes: newNodes,
          },
        },
      };
    });
    tidyUp();
  }, [updateStore, tidyUp]);

  return {
    projects: (Object.values(store.projects) as MindMapProject[]).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    currentProjectId: store.currentProjectId,
    currentProject,
    selectedId,
    setSelectedId,
    updateNode,
    moveNode,
    addChild,
    addSibling,
    deleteNode,
    createProject,
    switchProject,
    deleteProject,
    renameProject,
    reParentNode,
    reorderNode,
    tidyUp,
    undo,
    redo,
    canUndo: history.length > 0,
    canRedo: redoStack.length > 0,
  };
}


