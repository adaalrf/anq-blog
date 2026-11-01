import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const update = () => setDark(document.documentElement.dataset.theme === 'dark');
    window.addEventListener('blog-theme-change', update);
    update();
    return () => window.removeEventListener('blog-theme-change', update);
  }, []);
  return (
    <button
      className="theme-control"
      type="button"
      role="switch"
      aria-label="Dark mode"
      aria-checked={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() =>
        window.dispatchEvent(new CustomEvent('blog-theme-set', { detail: dark ? 'light' : 'dark' }))
      }
    >
      <span className="theme-track" aria-hidden="true">
        <span className="theme-thumb">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            {dark ? (
              <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />
            ) : (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
              </>
            )}
          </svg>
        </span>
      </span>
    </button>
  );
}
