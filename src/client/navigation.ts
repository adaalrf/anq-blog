import { useEffect } from 'react';

// Keep ordinary links/forms usable, including modified clicks and new tabs.
// Only this application's same-path navigation is handled without a reload.
export function useNavigation(onNavigate: (search: string) => void) {
  useEffect(() => {
    function navigate(url: URL) {
      if (url.href !== location.href) history.pushState(null, '', url);
      onNavigate(url.search);
      window.scrollTo(0, 0);
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
      });
    }
    function click(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (
        !anchor ||
        anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self')
      )
        return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash) return;
      event.preventDefault();
      navigate(url);
    }
    function submit(event: SubmitEvent) {
      const form = event.target;
      if (
        event.defaultPrevented ||
        !(form instanceof HTMLFormElement) ||
        form.method.toLowerCase() !== 'get' ||
        form.getAttribute('role') !== 'search' ||
        (form.target && form.target !== '_self')
      )
        return;
      const url = new URL(form.action || location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname) return;
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(form))
        if (typeof value === 'string') params.append(key, value);
      url.search = params.toString();
      event.preventDefault();
      navigate(url);
    }
    function pop() {
      onNavigate(location.search);
    }
    document.addEventListener('click', click);
    document.addEventListener('submit', submit);
    window.addEventListener('popstate', pop);
    return () => {
      document.removeEventListener('click', click);
      document.removeEventListener('submit', submit);
      window.removeEventListener('popstate', pop);
    };
  }, [onNavigate]);
}
