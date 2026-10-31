import { useEffect, useRef, useState, type ReactNode } from 'react';

export function NavigationShell({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 760px)').matches);
  const [open, setOpen] = useState(false);
  const shell = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = matchMedia('(max-width: 760px)');
    const resize = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty(
        '--nav-height',
        `${shell.current?.getBoundingClientRect().height || 72}px`,
      );
    });
    if (shell.current) observer.observe(shell.current);
    media.addEventListener('change', resize);
    return () => {
      media.removeEventListener('change', resize);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!shell.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);
  return (
    <aside
      className="sidebar navigation-shell"
      ref={shell}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      {brand}
      <button
        ref={toggle}
        className="navigation-toggle"
        type="button"
        aria-label={open ? 'Close menu' : 'Menu'}
        aria-expanded={open}
        aria-controls="navigation-panel"
        onClick={() => setOpen(!open)}
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d={open ? 'm6 6 12 12M18 6 6 18' : 'M4 6h16M4 12h16M4 18h16'} />
        </svg>
      </button>
      <div
        id="navigation-panel"
        className="navigation-panel"
        hidden={mobile && !open}
        onClick={(event) => {
          const target = event.target as Element;
          if (
            mobile &&
            target.closest('a,nav button') &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            setOpen(false);
            requestAnimationFrame(() => {
              const heading = document.querySelector<HTMLElement>('main h1');
              if (heading) {
                heading.tabIndex = -1;
                heading.focus({ preventScroll: true });
              }
            });
          }
        }}
      >
        {children}
      </div>
    </aside>
  );
}

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const control = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const scroll = () => setVisible(scrollY > 500 || document.activeElement === control.current);
    scroll();
    window.addEventListener('scroll', scroll, { passive: true });
    return () => window.removeEventListener('scroll', scroll);
  }, []);
  if (!visible) return null;
  return (
    <nav aria-label="Page navigation">
      <button
        className="back-to-top"
        ref={control}
        type="button"
        aria-label="Back to top"
        onClick={() => {
          document.querySelector<HTMLElement>('.logo,.brand')?.focus({ preventScroll: true });
          window.scrollTo({
            top: 0,
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
          });
        }}
      >
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M8 13V3m-4 4 4-4 4 4" />
        </svg>
        Top
      </button>
    </nav>
  );
}
