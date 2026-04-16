import React, { useEffect, useRef, useState } from 'react';
import { motion, useDragControls } from 'motion/react';
import { cn } from '../lib/utils';

interface NodeProps {
  id: string;
  text: string;
  position: { x: number; y: number };
  isSelected: boolean;
  isRoot: boolean;
  onSelect: () => void;
  onUpdateText: (text: string) => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDelete: () => void;
  onMove: (delta: { x: number; y: number }) => void;
  onDragStart: () => void;
  onDragEnd: (finalPos: { x: number; y: number }) => void;
  depth: number;
  isDropTarget?: boolean;
}

export const Node: React.FC<NodeProps> = ({
  id,
  text,
  position,
  isSelected,
  isRoot,
  onSelect,
  onUpdateText,
  onAddChild,
  onAddSibling,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
  depth,
  isDropTarget,
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const dragControls = useDragControls();

  useEffect(() => {
    if (isSelected && text === '') {
      setIsEditing(true);
    }
  }, [isSelected, text]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(text.length, text.length);
      // Adjust height to show all content including newlines
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [isEditing, text.length]);

  // Handle focus when selected
  useEffect(() => {
    if (isSelected && !isEditing && containerRef.current) {
      containerRef.current.focus();
    }
  }, [isSelected, isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditing) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        setIsEditing(false);
        onAddSibling();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        setIsEditing(false);
        onAddChild();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        setIsEditing(false);
      }
    } else if (isSelected) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onAddSibling();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        onAddChild();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.stopPropagation();
        if (!isRoot) onDelete();
      } else if (e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        setIsEditing(true);
      }
    }
  };

  const themeColor = '#3b82f6';

  return (
    <motion.div
      ref={containerRef}
      tabIndex={0}
      onPan={(e, info) => {
        onMove({ x: info.delta.x, y: info.delta.y });
      }}
      onPanStart={() => {
        onSelect();
        onDragStart();
      }}
      onPanEnd={() => {
        onDragEnd(position);
      }}
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        touchAction: 'none',
        outline: 'none'
      }}
      className={cn(
        "z-10 flex items-center justify-center min-w-[140px] group -translate-x-1/2 -translate-y-1/2",
        isEditing ? "z-50" : "z-10",
        isSelected ? "z-20" : "",
        isDropTarget ? "z-30" : "",
        "max-w-[280px]"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      <div
        className={cn(
          "w-full px-4 py-2 transition-all duration-200 rounded-lg border-2 flex items-center justify-center min-h-[44px]",
          isSelected 
            ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105" 
            : "border-foreground/20 bg-card hover:border-primary/50",
          isDropTarget ? "border-emerald-500 bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.6)] scale-110" : "",
          isRoot ? "border-primary/50 border-4 min-w-[180px]" : ""
        )}
      >
        {isEditing ? (
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => onUpdateText(e.target.value)}
            onBlur={() => setIsEditing(false)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent border-none outline-none resize-none text-center block overflow-hidden text-foreground font-medium break-all"
            rows={1}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${target.scrollHeight}px`;
            }}
          />
        ) : (
          <div className="whitespace-pre-wrap text-center break-all select-none text-foreground font-medium w-full">
            {text || <span className="opacity-50 italic">New Node</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
};



