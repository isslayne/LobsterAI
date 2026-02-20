import { configService } from './config';

type ThemeType = 'light' | 'dark' | 'system';
type ThemeStyle = 'classic' | 'tahoe';

// Color palette per theme variant
const COLORS = {
  light: {
    bg: '#F8F9FB',
    text: '#1A1D23',
  },
  dark: {
    bg: '#0F1117',
    text: '#E4E5E9',
  },
  tahoeDark: {
    bg: '#0C0E18',
    text: '#E8EAF0',
  },
};

class ThemeService {
  private mediaQuery: MediaQueryList | null = null;
  private currentTheme: ThemeType = 'system';
  private currentThemeStyle: ThemeStyle = 'classic';
  private appliedTheme: 'light' | 'dark' | null = null;
  private initialized = false;
  private mediaQueryListener: ((event: MediaQueryListEvent) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    }
  }

  // 初始化主题
  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    try {
      const config = configService.getConfig();

      // 先设置主题风格（可能强制 dark）
      if (config.themeStyle) {
        this.currentThemeStyle = config.themeStyle;
      }

      if (this.currentThemeStyle === 'tahoe') {
        // Tahoe 强制深色模式
        document.documentElement.classList.add('tahoe');
        this.setTheme('dark');
      } else {
        this.setTheme(config.theme);
      }

      // 监听系统主题变化
      if (this.mediaQuery) {
        this.mediaQueryListener = (e) => {
          if (this.currentTheme === 'system' && this.currentThemeStyle !== 'tahoe') {
            this.applyTheme(e.matches ? 'dark' : 'light');
          }
        };
        this.mediaQuery.addEventListener('change', this.mediaQueryListener);
      }
    } catch (error) {
      console.error('Failed to initialize theme:', error);
      this.setTheme('system');
    }
  }

  // 设置主题风格
  setThemeStyle(style: ThemeStyle): void {
    if (this.currentThemeStyle === style) {
      return;
    }

    console.log(`Setting theme style to: ${style}`);
    this.currentThemeStyle = style;
    const root = document.documentElement;

    if (style === 'tahoe') {
      root.classList.add('tahoe');
      // Tahoe 强制深色模式，重置 appliedTheme 以确保重新应用
      this.appliedTheme = null;
      this.currentTheme = 'dark';
      this.applyTheme('dark');
    } else {
      root.classList.remove('tahoe');
      // 恢复时重新应用当前主题以刷新颜色
      this.appliedTheme = null;
      this.applyTheme(this.getEffectiveTheme());
    }

    // 通知主进程更新标题栏
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send('app:setThemeStyle', style);
    }
  }

  // 获取当前主题风格
  getThemeStyle(): ThemeStyle {
    return this.currentThemeStyle;
  }

  // 设置主题
  setTheme(theme: ThemeType): void {
    // Tahoe 模式下忽略非 dark 的切换请求
    if (this.currentThemeStyle === 'tahoe' && theme !== 'dark') {
      return;
    }

    const effectiveTheme = theme === 'system'
      ? (this.mediaQuery?.matches ? 'dark' : 'light')
      : theme;

    if (this.currentTheme === theme && this.appliedTheme === effectiveTheme) {
      return;
    }

    console.log(`Setting theme to: ${theme}`);
    this.currentTheme = theme;

    if (theme === 'system') {
      console.log(`System theme detected, using: ${effectiveTheme}`);
    }

    this.applyTheme(effectiveTheme);
  }

  // 获取当前主题
  getTheme(): ThemeType {
    return this.currentTheme;
  }

  // 获取当前有效主题（实际应用的明/暗主题）
  getEffectiveTheme(): 'light' | 'dark' {
    if (this.currentThemeStyle === 'tahoe') {
      return 'dark';
    }
    if (this.currentTheme === 'system') {
      return this.mediaQuery?.matches ? 'dark' : 'light';
    }
    return this.currentTheme;
  }

  // 应用主题到DOM
  private applyTheme(theme: 'light' | 'dark'): void {
    if (this.appliedTheme === theme) {
      return;
    }

    console.log(`Applying theme: ${theme}`);
    this.appliedTheme = theme;
    const root = document.documentElement;

    // 判断是否使用 Tahoe 深色色值
    const isTahoe = this.currentThemeStyle === 'tahoe' && theme === 'dark';
    const colors = isTahoe ? COLORS.tahoeDark : COLORS[theme];

    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      document.body.classList.remove('dark');
      document.body.classList.add('light');
    }

    // Set background and text colors
    root.style.backgroundColor = colors.bg;
    document.body.style.backgroundColor = colors.bg;
    document.body.style.color = colors.text;

    // Update CSS variables for color transition animations
    root.style.setProperty('--theme-transition', 'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease');
    document.body.style.transition = 'var(--theme-transition)';

    // Ensure #root element also gets the theme
    const rootElement = document.getElementById('root');
    if (rootElement) {
      if (theme === 'dark') {
        rootElement.classList.add('dark');
        rootElement.classList.remove('light');
      } else {
        rootElement.classList.remove('dark');
        rootElement.classList.add('light');
      }
      rootElement.style.backgroundColor = colors.bg;
    }
  }
}

export const themeService = new ThemeService();
