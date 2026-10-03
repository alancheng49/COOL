import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 彈窗背景的關閉邏輯:mousedown 與 mouseup 都發生在背景上才關閉。
 * 避免「從彈窗內選取文字、拖出視窗外放開」時彈窗被誤關。
 * 用法:<div className="fixed inset-0 ..." {...backdropClose(onClose)}>
 */
let downOnBackdrop = false;
export function backdropClose(close: () => void) {
  return {
    onMouseDown: (e: React.MouseEvent) => {
      downOnBackdrop = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (downOnBackdrop && e.target === e.currentTarget) close();
      downOnBackdrop = false;
    },
  };
}
