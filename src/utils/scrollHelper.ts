/**
 * Utility for smooth, slow, and graceful scrolling animations.
 */

let activeScrollAnimationId: number | null = null;
let activeCleanup: (() => void) | null = null;

export function smoothScrollToSlow(targetY: number, duration = 800): Promise<void> {
  return new Promise((resolve) => {
    // Cancel any previous in-flight scroll animation and remove listeners
    if (activeScrollAnimationId !== null) {
      cancelAnimationFrame(activeScrollAnimationId);
      activeScrollAnimationId = null;
    }
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }

    const startY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const clampedTargetY = Math.max(0, Math.round(targetY));
    const distance = clampedTargetY - startY;

    // If already at target position, no animation needed
    if (Math.abs(distance) < 2) {
      resolve();
      return;
    }

    const startTime = performance.now();

    // Allow user to cancel the smooth scroll if they manually touch or scroll
    const handleUserInterrupt = () => {
      if (activeScrollAnimationId !== null) {
        cancelAnimationFrame(activeScrollAnimationId);
        activeScrollAnimationId = null;
      }
      if (activeCleanup) {
        activeCleanup();
        activeCleanup = null;
      }
      resolve();
    };

    window.addEventListener('wheel', handleUserInterrupt, { passive: true });
    window.addEventListener('touchmove', handleUserInterrupt, { passive: true });

    activeCleanup = () => {
      window.removeEventListener('wheel', handleUserInterrupt);
      window.removeEventListener('touchmove', handleUserInterrupt);
    };

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // EaseInOutCubic: starts gentle, glides smoothly, and finishes softly
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const newY = Math.round(startY + distance * ease);
      window.scrollTo(0, newY);

      if (progress < 1) {
        activeScrollAnimationId = requestAnimationFrame(step);
      } else {
        window.scrollTo(0, clampedTargetY);
        activeScrollAnimationId = null;
        if (activeCleanup) {
          activeCleanup();
          activeCleanup = null;
        }
        resolve();
      }
    }

    activeScrollAnimationId = requestAnimationFrame(step);
  });
}

/**
 * Scrolls the page slowly so that the search bar is positioned as high as possible
 * (directly under the sticky navbar with minimal padding), giving maximum space
 * for the virtual keyboard and search results below.
 */
export function scrollSearchToTopSlow(duration = 400): void {
  // En móviles donde la barra de búsqueda es fija/adhesiva al tope, desplazamos limpiamente a 0
  // para que la primera tarjeta (Japón) quede completamente visible con su bandera
  if (window.innerWidth < 768) {
    smoothScrollToSlow(0, Math.min(duration, 300));
    return;
  }

  const searchInput = document.getElementById('catalog-search-input');
  const header = document.querySelector('header');
  const isHeaderVisible = header && getComputedStyle(header).display !== 'none';
  const headerBottom = isHeaderVisible ? Math.max(header.getBoundingClientRect().bottom, 0) : 0;
  
  if (!searchInput) {
    smoothScrollToSlow(0, duration);
    return;
  }

  // Dejar espacio prudente para no ocultar tarjetas ni banderas
  const desiredTop = headerBottom + 12;
  const rect = searchInput.getBoundingClientRect();
  const currentScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
  
  const targetY = Math.max(0, currentScroll + rect.top - desiredTop);
  smoothScrollToSlow(targetY, duration);
}
