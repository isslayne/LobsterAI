import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { coworkService } from '../services/cowork';
import { i18nService } from '../services/i18n';
import CoworkSessionList from './cowork/CoworkSessionList';
import CoworkSearchModal from './cowork/CoworkSearchModal';
import { MagnifyingGlassIcon, PuzzlePieceIcon, ClockIcon } from '@heroicons/react/24/outline';
import ComposeIcon from './icons/ComposeIcon';
import SidebarToggleIcon from './icons/SidebarToggleIcon';

interface SidebarProps {
  onShowSettings: () => void;
  onShowLogin?: () => void;
  activeView: 'cowork' | 'skills' | 'scheduledTasks';
  onShowSkills: () => void;
  onShowCowork: () => void;
  onShowScheduledTasks: () => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  updateBadge?: React.ReactNode;
}

const navItemBase = 'w-full inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors';
const navItemActive = 'dark:text-claude-darkText text-claude-text dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover';
const navItemIdle = 'dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-text dark:hover:text-claude-darkText hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover';

const Sidebar: React.FC<SidebarProps> = ({
  onShowSettings,
  activeView,
  onShowSkills,
  onShowCowork,
  onShowScheduledTasks,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  updateBadge,
}) => {
  const sessions = useSelector((state: RootState) => state.cowork.sessions);
  const currentSessionId = useSelector((state: RootState) => state.cowork.currentSessionId);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const isMac = window.electron.platform === 'darwin';

  useEffect(() => {
    const handleSearch = () => {
      onShowCowork();
      setIsSearchOpen(true);
    };
    window.addEventListener('cowork:shortcut:search', handleSearch);
    return () => {
      window.removeEventListener('cowork:shortcut:search', handleSearch);
    };
  }, [onShowCowork]);

  useEffect(() => {
    if (!isCollapsed) return;
    setIsSearchOpen(false);
  }, [isCollapsed]);

  const handleSelectSession = async (sessionId: string) => {
    onShowCowork();
    await coworkService.loadSession(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    await coworkService.deleteSession(sessionId);
  };

  const handleTogglePin = async (sessionId: string, pinned: boolean) => {
    await coworkService.setSessionPinned(sessionId, pinned);
  };

  const handleRenameSession = async (sessionId: string, title: string) => {
    await coworkService.renameSession(sessionId, title);
  };

  return (
    <aside
      className={`shrink-0 relative dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted flex flex-col sidebar-transition overflow-hidden glass-sidebar ${
        isCollapsed ? 'w-0' : 'w-60'
      }`}
    >
      {/* Traffic lights drag area + toggle */}
      <div className="draggable sidebar-header-drag h-[52px] flex items-center justify-between px-3 shrink-0">
        <div className={`${isMac ? 'pl-[68px]' : ''}`}>
          {updateBadge}
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="non-draggable h-8 w-8 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
          aria-label={isCollapsed ? i18nService.t('expand') : i18nService.t('collapse')}
        >
          <SidebarToggleIcon className="h-4 w-4" isCollapsed={isCollapsed} />
        </button>
      </div>

      {/* Action buttons: New Chat + Search side by side */}
      <div className="px-3 pb-3">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onNewChat}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg h-9 text-sm font-medium bg-claude-accent text-white hover:bg-claude-accentHover transition-colors"
          >
            <ComposeIcon className="h-4 w-4" />
            {i18nService.t('newChat')}
          </button>
          <button
            type="button"
            onClick={() => {
              onShowCowork();
              setIsSearchOpen(true);
            }}
            className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg dark:bg-claude-darkSurfaceHover/50 bg-claude-surfaceHover dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors border dark:border-claude-darkBorder/30 border-claude-border/30"
          >
            <MagnifyingGlassIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Nav items */}
        <div className="mt-2 space-y-0.5">
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(false);
              onShowScheduledTasks();
            }}
            className={`${navItemBase} ${activeView === 'scheduledTasks' ? navItemActive : navItemIdle}`}
          >
            <ClockIcon className="h-4 w-4" />
            {i18nService.t('scheduledTasks')}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(false);
              onShowSkills();
            }}
            className={`${navItemBase} ${activeView === 'skills' ? navItemActive : navItemIdle}`}
          >
            <PuzzlePieceIcon className="h-4 w-4" />
            {i18nService.t('skills')}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px dark:bg-claude-darkBorder bg-claude-border" />

      {/* History section */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-4 pt-2">
        <div className="px-3 pb-2 text-xs font-medium tracking-wide uppercase dark:text-claude-darkTextSecondary/60 text-claude-textSecondary/60">
          {i18nService.t('coworkHistory')}
        </div>
        <CoworkSessionList
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onTogglePin={handleTogglePin}
          onRenameSession={handleRenameSession}
        />
      </div>
      <CoworkSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onTogglePin={handleTogglePin}
        onRenameSession={handleRenameSession}
      />

      {/* Divider */}
      <div className="mx-3 h-px dark:bg-claude-darkBorder bg-claude-border" />

      {/* Settings */}
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={() => onShowSettings()}
          className={`${navItemBase} ${navItemIdle}`}
          aria-label={i18nService.t('settings')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M14 17H5" /><path d="M19 7h-9" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>
          {i18nService.t('settings')}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
