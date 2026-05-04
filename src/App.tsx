import React, { useState, useEffect, useRef } from 'react';
import { useMindMap } from './hooks/useMindMap';
import { Node } from './components/Node';
import { MindMapNode, MindMapProject } from './types';
import { 
  Sun, Moon, ZoomIn, ZoomOut, Maximize, Trash2, Plus, 
  MousePointer2, Keyboard, Menu, X, FileText, Settings2,
  ChevronRight, MoreVertical, Edit2, Copy, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// 忍者広告 (Shinobi Ad) コンポーネント
const ShinobiAd = ({ src }: { src: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // 既存の内容をクリア
      containerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = src;
      script.type = 'text/javascript';
      script.async = true;
      containerRef.current.appendChild(script);
    }
  }, [src]);

  return <div ref={containerRef} className="w-full flex justify-center" />;
};

export default function App() {
  const { 
    projects, currentProjectId, currentProject, selectedId, setSelectedId, 
    updateNode, moveNode, addChild, addSibling, deleteNode,
    createProject, switchProject, deleteProject, renameProject, reParentNode,
    reorderNode, tidyUp, undo, redo, canUndo, canRedo
  } = useMindMap();

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') as 'light' | 'dark' || 'dark';
    }
    return 'dark';
  });

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [potentialParentId, setPotentialParentId] = useState<string | null>(null);
  const [dropType, setDropType] = useState<'reorder' | 'reparent' | 'promote' | null>(null);
  const [dropIndex, setDropIndex] = useState<number>(0);
  const [initialPos, setInitialPos] = useState<{x: number, y: number} | null>(null);
  const [copied, setCopied] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    // Initial tidy up
    tidyUp();
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [undo, redo]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && (e.target as HTMLElement).classList.contains('mindmap-canvas')) {
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset((prev) => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY,
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prev) => Math.min(Math.max(prev * delta, 0.2), 3));
    } else {
      setOffset((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  const centerRoot = () => {
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  };

  const renderConnections = () => {
    if (!currentProject) return null;
    
    return (
      <svg className="absolute inset-0 pointer-events-none overflow-visible">
        {(Object.values(currentProject.nodes) as MindMapNode[]).map((node: MindMapNode) => {
          return node.children.map((childId: string) => {
            const child = currentProject.nodes[childId];
            if (!child) return null;
            
            // Node dimensions (approximate)
            const nodeW = 160;
            
            // Calculate anchor points based on relative position
            const dx = child.position.x - node.position.x;
            const dy = child.position.y - node.position.y;
            
            // Parent anchor: Right side if child is to the right, Left side if child is to the left
            const sX = node.position.x + (dx > 0 ? nodeW / 2 : -nodeW / 2);
            const sY = node.position.y;

            // Child anchor: Left side if child is to the right, Right side if child is to the left
            const eX = child.position.x + (dx > 0 ? -nodeW / 2 : nodeW / 2);
            const eY = child.position.y;
            
            // Control points for a smooth cubic bezier curve
            const curveStrength = Math.max(Math.abs(eX - sX) * 0.5, 40);
            const cp1x = sX + (dx > 0 ? curveStrength : -curveStrength);
            const cp2x = eX + (dx > 0 ? -curveStrength : curveStrength);
            
            return (
              <path
                key={`${node.id}-${childId}`}
                d={`M ${sX} ${sY} C ${cp1x} ${sY}, ${cp2x} ${eY}, ${eX} ${eY}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className={cn(
                  "transition-colors duration-300",
                  draggingNodeId === node.id || draggingNodeId === childId 
                    ? "text-primary stroke-[3.5px]" 
                    : "text-foreground/20"
                )}
              />
            );
          });
        })}

        {/* Drag Preview / Potential Parent/Sibling Guide */}
        {draggingNodeId && potentialParentId && (
          <g>
            {(() => {
              const node = currentProject.nodes[draggingNodeId];
              const target = currentProject.nodes[potentialParentId];
              if (!node || !target) return null;
              
              const nodeW = 160;
              const nodeH = 40;
              let sX, sY, eX, eY;

              if (dropType === 'reorder') {
                // Show horizontal line at insertion point
                // Calculate if we are inserting above or below the target
                const isBelow = node.position.y > target.position.y;
                sX = target.position.x - nodeW / 2;
                sY = target.position.y + (isBelow ? nodeH / 2 + 10 : -nodeH / 2 - 10);
                eX = target.position.x + nodeW / 2;
                eY = sY;
                
                return (
                  <line
                    x1={sX} y1={sY} x2={eX} y2={eY}
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeDasharray="4 4"
                    className="animate-pulse"
                  />
                );
              } else {
                // Show connection to potential parent
                sX = target.position.x + nodeW / 2;
                sY = target.position.y;
                eX = node.position.x - nodeW / 2;
                eY = node.position.y;
                
                const curveStrength = Math.max(Math.abs(eX - sX) * 0.5, 40);
                const cp1x = sX + curveStrength;
                const cp2x = eX - curveStrength;

                return (
                  <path
                    d={`M ${sX} ${sY} C ${cp1x} ${sY}, ${cp2x} ${eY}, ${eX} ${eY}`}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    strokeDasharray="6 6"
                    className="animate-pulse"
                  />
                );
              }
            })()}
          </g>
        )}
      </svg>
    );
  };

  const handleNodeDragStart = (nodeId: string) => {
    const node = currentProject?.nodes[nodeId];
    if (node) {
      setInitialPos({ ...node.position });
    }
  };

  const handleNodeDrag = (nodeId: string, delta: { x: number; y: number }) => {
    if (!currentProject) return;
    const node = currentProject.nodes[nodeId];
    if (!node) return;

    // Remove X-axis constraint to allow free movement (especially for promotion)
    moveNode(nodeId, delta);
    setDraggingNodeId(nodeId);
    
    const nodeW = 160;
    const nodeH = 40;

    let bestTargetId: string | null = null;
    let bestDropType: 'reorder' | 'reparent' | 'promote' | null = null;
    let bestIndex = 0;
    let minDistance = 150;

    (Object.values(currentProject.nodes) as MindMapNode[]).forEach(other => {
      if (other.id === nodeId) return;
      
      // Cycle check
      let curr: string | null = other.id;
      let isDescendant = false;
      while (curr) {
        if (curr === nodeId) { isDescendant = true; break; }
        curr = currentProject.nodes[curr].parentId;
      }
      if (isDescendant) return;

      const dx = node.position.x - other.position.x;
      const dy = node.position.y - other.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 1. Reordering (Dragging between siblings) - High priority for vertical movement near siblings
      if (other.parentId && other.parentId === node.parentId) {
        if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
          if (dist < minDistance) {
            minDistance = dist;
            bestTargetId = other.id;
            bestDropType = 'reorder';
            const parent = currentProject.nodes[other.parentId];
            const idx = parent.children.indexOf(other.id);
            bestIndex = dy > 0 ? idx + 1 : idx;
            return; // Found a good sibling match, skip reparent check for this node
          }
        }
      }

      // 2. Reparenting (Dragging onto or to the right of Node B)
      // If overlapping (dist < 50) or specifically to the right (dx > 40 && dist < 150)
      if (dist < 50 || (dx > 40 && dist < 150)) {
        if (dist < minDistance) {
          minDistance = dist;
          bestTargetId = other.id;
          bestDropType = 'reparent';
          bestIndex = other.children.length; // Add to end by default
        }
      }
    });

    // 3. Special check for Promotion (Drag far left of parent)
    // Prioritize promotion if dragged significantly to the left
    if (node.parentId) {
      const parent = currentProject.nodes[node.parentId];
      if (parent && parent.parentId && node.position.x < parent.position.x - 80) {
        bestTargetId = parent.parentId;
        bestDropType = 'promote';
        const grandparent = currentProject.nodes[parent.parentId];
        bestIndex = grandparent.children.indexOf(parent.id) + 1;
        minDistance = 0; // Force this choice
      }
    }

    setPotentialParentId(bestTargetId);
    setDropType(bestDropType);
    setDropIndex(bestIndex);
  };

  const resolveCollisions = (nodeId: string) => {
    if (!currentProject) return;
    const nodes = Object.values(currentProject.nodes) as MindMapNode[];
    const node = currentProject.nodes[nodeId];
    if (!node) return;

    const nodeW = 200; // Buffer width
    const nodeH = 80;  // Buffer height
    let totalDeltaY = 0;

    // Sort nodes by Y to resolve collisions in order
    const otherNodes = nodes.filter(n => n.id !== nodeId).sort((a, b) => a.position.y - b.position.y);

    otherNodes.forEach(other => {
      // Check if 'other' is a descendant of 'node' (don't collide with children)
      let isDescendant = false;
      let curr: string | null = other.id;
      while (curr) {
        if (curr === nodeId) { isDescendant = true; break; }
        curr = currentProject.nodes[curr].parentId;
      }
      if (isDescendant) return;

      const dx = node.position.x - other.position.x;
      const dy = (node.position.y + totalDeltaY) - other.position.y;

      if (Math.abs(dx) < nodeW && Math.abs(dy) < nodeH) {
        // Collision detected, calculate vertical push
        // If node is below other, push down. If above, push up.
        const pushY = dy >= 0 ? (nodeH - dy) : (-nodeH - dy);
        totalDeltaY += pushY;
      }
    });

    if (totalDeltaY !== 0) {
      moveNode(nodeId, { x: 0, y: totalDeltaY });
    }
  };

  const handleNodeDragEnd = (nodeId: string, finalPos: { x: number; y: number }) => {
    if (potentialParentId && dropType) {
      if (dropType === 'reorder') {
        reorderNode(nodeId, dropIndex);
      } else if (dropType === 'reparent' || dropType === 'promote') {
        reParentNode(nodeId, potentialParentId, dropIndex);
      }
    } else {
      // No structural change, just resolve collisions
      resolveCollisions(nodeId);
    }
    
    setDraggingNodeId(null);
    setPotentialParentId(null);
    setDropType(null);
    setInitialPos(null);
    tidyUp(); // Always tidy up after drop to ensure perfect alignment
  };

  const handleCopyAllText = () => {
    if (!currentProject) return;

    const exportAsText = (nodeId: string, depth: number = 0): string => {
      const node = currentProject.nodes[nodeId];
      if (!node) return '';
      const indent = '  '.repeat(depth);
      const text = node.text.trim() || '(Empty)';
      const currentLine = `${indent}- ${text}\n`;
      const childrenLines = node.children
        .map(childId => exportAsText(childId, depth + 1))
        .join('');
      return currentLine + childrenLines;
    };

    const fullText = exportAsText(currentProject.rootId);
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const renderNodes = (nodeId: string, depth: number = 0) => {
    const node = currentProject.nodes[nodeId];
    if (!node) return null;

    return (
      <React.Fragment key={nodeId}>
        <Node
          id={nodeId}
          text={node.text}
          position={node.position}
          isSelected={selectedId === nodeId}
          isRoot={nodeId === currentProject.rootId}
          isDropTarget={potentialParentId === nodeId}
          depth={depth}
          onSelect={() => setSelectedId(nodeId)}
          onUpdateText={(text) => updateNode(nodeId, { text })}
          onMove={(delta) => handleNodeDrag(nodeId, { x: delta.x / zoom, y: delta.y / zoom })}
          onDragStart={() => handleNodeDragStart(nodeId)}
          onDragEnd={(finalPos) => handleNodeDragEnd(nodeId, finalPos)}
          onAddChild={() => {
            const node = currentProject.nodes[nodeId];
            if (node && node.children.length > 0) {
              setSelectedId(node.children[0]);
            } else {
              addChild(nodeId);
            }
          }}
          onAddSibling={() => addSibling(nodeId)}
          onDelete={() => deleteNode(nodeId)}
        />
        {node.children.map((childId) => renderNodes(childId, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div 
      id="app-root" 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100vh', 
        width: '100vw', 
        overflow: 'hidden',
        backgroundColor: theme === 'dark' ? '#0a0a0a' : '#ffffff'
      }} 
      className={cn(theme, "text-foreground")}
    >
      {/* メインコンテンツ (上部広告を削除し、marginTopも0に) */}
      <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden', position: 'relative' }}>
        {/* 左：サイドバー */}
        <AnimatePresence mode="wait">
          {showSidebar && (
            <motion.aside
              id="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="no-scrollbar"
              style={{ 
                width: '260px', 
                display: 'flex', 
                flexDirection: 'column', 
                background: '#111', 
                zIndex: 9999,
                flexShrink: 0,
                borderRight: '1px solid #333',
                overflow: 'hidden'
              }}
            >
              {/* 【メニュー項目 - 固定ヘッダー】 */}
              <div style={{ padding: '20px', flexShrink: 0, color: 'white' }}>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                      <MousePointer2 className="text-primary-foreground w-5 h-5" />
                    </div>
                    <h1 className="font-bold tracking-tight">MindMap</h1>
                  </div>
                  <button onClick={() => setShowSidebar(false)} className="p-1 hover:bg-white/10 rounded">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* スクロール可能なリスト領域 */}
              <div className="no-scrollbar" style={{ flexGrow: 1, overflowY: 'auto', padding: '0 20px 20px 20px', color: 'white' }}>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3 px-2">
                      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">My Maps</h2>
                      <button 
                        onClick={() => createProject()}
                        className="p-1 hover:bg-primary/10 text-primary rounded transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {projects.map((p: MindMapProject) => (
                        <div 
                          key={p.id}
                          className={cn(
                            "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all border border-transparent relative",
                            currentProject && currentProject.id === p.id 
                              ? "bg-primary/10 text-primary border-primary/20 shadow-sm" 
                              : "hover:bg-white/5 text-white/60 hover:text-white"
                          )}
                          onClick={(e) => {
                            if (e.detail === 1) {
                              switchProject(p.id);
                            } else if (e.detail === 2) {
                              setEditingProjectId(p.id);
                            }
                          }}
                        >
                          <FileText className="w-4 h-4 flex-shrink-0" />
                          {editingProjectId === p.id ? (
                            <input
                              autoFocus
                              placeholder="名前を入力..."
                              className="bg-white/10 border-none outline-none w-full text-sm text-white px-1 rounded"
                              value={p.title}
                              onChange={(e) => renameProject(p.id, e.target.value)}
                              onBlur={() => {
                                if (p.title.trim() === "") {
                                  renameProject(p.id, "名称未設定");
                                }
                                setEditingProjectId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.stopPropagation();
                                  if (p.title.trim() === "") {
                                    renameProject(p.id, "名称未設定");
                                  }
                                  setEditingProjectId(null);
                                }
                                if (e.key === 'Escape') {
                                  e.stopPropagation();
                                  setEditingProjectId(null);
                                }
                              }}
                            />
                          ) : (
                            <>
                              <span className="text-sm font-medium truncate flex-1 py-1">
                                {p.title || "名称未設定"}
                              </span>
                              {projects.length > 1 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProjectToDelete(p.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 hover:text-destructive rounded transition-all"
                                  title="削除"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* モードボタン */}
              <div id="mode-button" style={{ padding: '0 20px 15px 20px' }}>
                <button 
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium text-white"
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* 右：マインドマップ領域 */}
        <div style={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
          {/* ヘッダーオーバーレイ */}
          <header 
            className="fixed flex items-center justify-between px-6 py-4 pointer-events-none z-20"
            style={{ 
              top: '0', 
              left: showSidebar ? '260px' : '0', 
              right: '0',
              transition: 'left 0.3s ease-in-out'
            }}
          >
            <div className="flex items-center gap-4 pointer-events-auto">
              {!showSidebar && (
                <button 
                  onClick={() => setShowSidebar(true)}
                  className="p-2 bg-background border rounded-lg shadow-sm hover:bg-accent transition-colors"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}
              <div className="bg-background/80 backdrop-blur-md border rounded-lg px-4 py-2 shadow-sm flex items-center gap-3">
                <span className="text-sm font-semibold">{currentProject?.title}</span>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              </div>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={handleCopyAllText}
                className="p-2 bg-background border rounded-lg shadow-sm hover:bg-accent transition-all flex items-center gap-2"
                title="Copy All Text as Outline"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
                <span className="text-xs font-semibold hidden md:inline">
                  {copied ? 'Copied!' : 'Copy Text'}
                </span>
              </button>
              <button
                onClick={() => setShowShortcuts(!showShortcuts)}
                className="p-2 bg-background border rounded-lg shadow-sm hover:bg-accent transition-colors"
                title="Keyboard Shortcuts"
              >
                <Keyboard className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* マインドマップ本体 */}
          <main 
            ref={containerRef}
            className="mindmap-canvas cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <div 
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                transformOrigin: 'center',
              }}
            >
              <div className="relative w-0 h-0">
                {renderConnections()}
                {currentProject && renderNodes(currentProject.rootId)}
              </div>
            </div>
          </main>

          {/* ズームコントロール (右サイドバー 260px + 余白 24px = 284px) */}
          <div className="fixed bottom-6 right-[200px] flex flex-col gap-3 z-50 pointer-events-none transition-all duration-300">
            {/* ノード操作ボタン */}
            <div className="flex flex-col bg-background/95 backdrop-blur-md border border-border/50 rounded-xl shadow-2xl p-1.5 pointer-events-auto">
              <button 
                onClick={() => selectedId && addChild(selectedId)} 
                disabled={!selectedId}
                className="p-3 hover:bg-primary/10 text-primary rounded-lg transition-all active:scale-90 disabled:opacity-30 disabled:pointer-events-none" 
                title="子ノードを追加 (Tab)"
              >
                <Plus className="w-6 h-6" strokeWidth={2.5} />
                <span className="text-[10px] font-bold block mt-1">Child</span>
              </button>
              <div className="h-px bg-border/50 mx-2" />
              <button 
                onClick={() => selectedId && addSibling(selectedId)} 
                disabled={!selectedId || selectedId === currentProject?.rootId}
                className="p-3 hover:bg-primary/10 text-primary rounded-lg transition-all active:scale-90 disabled:opacity-30 disabled:pointer-events-none" 
                title="兄弟ノードを追加 (Enter)"
              >
                <ChevronRight className="w-6 h-6 rotate-90" strokeWidth={2.5} />
                <span className="text-[10px] font-bold block mt-1">Sibling</span>
              </button>
            </div>

            {/* ズーム・表示操作 */}
            <div className="flex flex-col bg-background/95 backdrop-blur-md border border-border/50 rounded-xl shadow-2xl p-1.5 pointer-events-auto">
              <button 
                onClick={() => setZoom(z => Math.min(z + 0.1, 3))} 
                className="p-3 hover:bg-primary/10 text-primary rounded-lg transition-all active:scale-90" 
                title="拡大"
              >
                <ZoomIn className="w-6 h-6" strokeWidth={2.5} />
              </button>
              <div className="h-px bg-border/50 mx-2" />
              <button 
                onClick={() => setZoom(z => Math.max(z - 0.1, 0.2))} 
                className="p-3 hover:bg-primary/10 text-primary rounded-lg transition-all active:scale-90" 
                title="縮小"
              >
                <ZoomOut className="w-6 h-6" strokeWidth={2.5} />
              </button>
              <div className="h-px bg-border/50 mx-2" />
              <button 
                onClick={centerRoot} 
                className="p-3 hover:bg-primary/10 text-primary rounded-lg transition-all active:scale-90" 
                title="中央に配置"
              >
                <Maximize className="w-6 h-6" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {projectToDelete && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-background border rounded-xl shadow-2xl p-6 max-w-sm w-full"
            >
              <h3 className="text-lg font-bold mb-2">マップを削除しますか？</h3>
              <p className="text-sm text-muted-foreground mb-6">
                「{projects.find(p => p.id === projectToDelete)?.title}」を削除してもよろしいですか？この操作は取り消せません。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setProjectToDelete(null)}
                  className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-accent transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    if (projectToDelete) {
                      deleteProject(projectToDelete);
                      setProjectToDelete(null);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  削除する
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-24 right-8 w-64 bg-background/95 backdrop-blur-md border rounded-xl shadow-2xl p-6 z-50"
          >
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <Keyboard className="w-4 h-4" /> Shortcuts
            </h3>
            <ul className="space-y-3 text-sm">
              <li className="flex justify-between items-center">
                <span className="text-muted-foreground">Undo</span>
                <kbd className="px-2 py-1 bg-accent rounded text-xs font-mono">Ctrl+Z</kbd>
              </li>
              <li className="flex justify-between items-center">
                <span className="text-muted-foreground">Redo</span>
                <kbd className="px-2 py-1 bg-accent rounded text-xs font-mono">Ctrl+Y</kbd>
              </li>
              <li className="flex justify-between items-center">
                <span className="text-muted-foreground">Add Child</span>
                <kbd className="px-2 py-1 bg-accent rounded text-xs font-mono">Tab</kbd>
              </li>
              <li className="flex justify-between items-center">
                <span className="text-muted-foreground">Add Sibling</span>
                <kbd className="px-2 py-1 bg-accent rounded text-xs font-mono">Enter</kbd>
              </li>
              <li className="flex justify-between items-center">
                <span className="text-muted-foreground">Edit Node</span>
                <kbd className="px-2 py-1 bg-accent rounded text-xs font-mono">Dbl Click</kbd>
              </li>
              <li className="flex justify-between items-center">
                <span className="text-muted-foreground">Delete Node</span>
                <kbd className="px-2 py-1 bg-accent rounded text-xs font-mono">Del</kbd>
              </li>
            </ul>
            <button 
              onClick={() => setShowShortcuts(false)}
              className="w-full mt-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Got it
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}>
        <ShinobiAd src="https://adm.shinobi.jp/s/cde6f48176e14f9ccb01df3d16b839" />
      </div>
    </div>
  );
}
