import { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';
import { Copy, ClipboardPaste, Undo, Redo, Info, Trash2 } from 'lucide-react';

export type ContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  type: 'node' | 'pane' | 'edge';
  canUndo: boolean;
  canRedo: boolean;
  hasClipboard: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onViewDetails?: () => void;
  onDelete?: () => void;
  selectedCount?: number;
};

export function ContextMenu({
  x, y, onClose, type, canUndo, canRedo, hasClipboard,
  onCopy, onPaste, onUndo, onRedo, onViewDetails, onDelete, selectedCount
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use timeout to prevent immediate close if rendered via click
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClick);
      window.addEventListener('contextmenu', handleClick);
    }, 10);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('contextmenu', handleClick);
    };
  }, [onClose]);

  const Item = ({ icon: Icon, label, onClick, disabled }: any) => (
    <button
      disabled={disabled}
      onClick={() => { onClick(); onClose(); }}
      className={cn(
        "w-full flex items-center px-3 py-1.5 text-sm transition-colors outline-none",
        disabled ? "opacity-50 cursor-not-allowed text-muted-foreground" : "cursor-pointer text-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground"
      )}
    >
      <Icon className="w-4 h-4 mr-2" />
      {label}
    </button>
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[160px] bg-[#18181b] border border-border shadow-2xl rounded-md py-1 overflow-hidden"
      style={{ left: x, top: y }}
    >
      {(type === 'node' || (type === 'pane' && selectedCount && selectedCount > 0)) && (
        <>
          {type === 'node' && <Item icon={Info} label="View Details" onClick={onViewDetails} />}
          <Item icon={Copy} label={selectedCount && selectedCount > 1 ? `Copy (${selectedCount})` : "Copy"} onClick={onCopy} />
          <Item icon={Trash2} label={selectedCount && selectedCount > 1 ? `Delete (${selectedCount})` : "Delete"} onClick={onDelete} />
          <div className="h-px bg-border my-1" />
        </>
      )}
      {type === 'edge' && (
        <>
          <Item icon={Trash2} label="Delete Connection" onClick={onDelete} />
          <div className="h-px bg-border my-1" />
        </>
      )}
      <Item icon={ClipboardPaste} label="Paste" onClick={onPaste} disabled={!hasClipboard} />
      <div className="h-px bg-border my-1" />
      <Item icon={Undo} label="Undo" onClick={onUndo} disabled={!canUndo} />
      <Item icon={Redo} label="Redo" onClick={onRedo} disabled={!canRedo} />
    </div>
  );
}
