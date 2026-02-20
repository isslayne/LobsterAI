import React, { useEffect } from 'react';
import { XMarkIcon, InformationCircleIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/outline';

type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastProps {
  message: string;
  type?: ToastType;
  onClose?: () => void;
  duration?: number;
}

const toastIcons: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  info: InformationCircleIcon,
  success: CheckCircleIcon,
  warning: ExclamationTriangleIcon,
  error: XCircleIcon,
};

const toastIconColors: Record<ToastType, string> = {
  info: 'text-claude-accent',
  success: 'text-emerald-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
};

const toastBgColors: Record<ToastType, string> = {
  info: 'bg-claude-accent/10',
  success: 'bg-emerald-500/10',
  warning: 'bg-amber-500/10',
  error: 'bg-red-500/10',
};

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose, duration = 4000 }) => {
  useEffect(() => {
    if (!onClose || duration <= 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const Icon = toastIcons[type];

  return (
    <div className="fixed top-6 left-1/2 z-50 -translate-x-1/2 animate-toast-slide-in">
      <div className="relative w-full max-w-sm rounded-xl border dark:border-claude-darkBorder/60 border-claude-border/60 dark:bg-claude-darkSurface/95 bg-white/95 dark:text-claude-darkText text-claude-text px-5 py-3.5 shadow-elevated backdrop-blur-md glass-panel">
        <div className="flex items-center gap-3">
          <div className={`shrink-0 rounded-full ${toastBgColors[type]} p-2`}>
            <Icon className={`h-4 w-4 ${toastIconColors[type]}`} />
          </div>
          <div className="flex-1 text-sm font-medium">
            {message}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="shrink-0 dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-text dark:hover:text-claude-darkText rounded-full p-1 hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Toast;
