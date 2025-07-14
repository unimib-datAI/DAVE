// @ts-nocheck
import useResizeObserver from '@/hooks/use-resize-ovserver';
import { documentPageAtom } from '@/utils/atoms';
import styled from '@emotion/styled';
import { useAtom } from 'jotai';
import {
  MouseEvent,
  PropsWithChildren,
  UIEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
  UIEvent,
} from 'react';
import { CSSTransition } from 'react-transition-group';

const SCROLL_BOX_MIN_HEIGHT = 20;
const SCROLL_THRESHOLD = 50; // Reduced threshold for better responsiveness
const SCROLL_DEBOUNCE_DELAY = 100; // Reduced delay for more responsive scrolling

const scrollbarBoxSizes = {
  boxHeight: SCROLL_BOX_MIN_HEIGHT,
  thumbTop: 0,
};

const ScrollHostContainer = styled.div({
  position: 'relative',
  height: '100%',
  overflow: 'hidden',
});

const ScrollHost = styled.div({
  overflow: 'auto',
  height: '100%',
  // hide native scrollbar
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  '::-webkit-scrollbar': {
    display: 'none',
  },
});

const StyledScrollbar = styled.div({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  height: '100%',
  width: '14px',
  padding: '2px 0',
  '&.thumb-enter': {
    opacity: 0,
  },
  '&.thumb-enter-active': {
    opacity: 1,
    transition: 'opacity 0.2s cubic-bezier(0.4,0,0.2,1)',
  },
  '&.thumb-exit': {
    opacity: 1,
  },
  '&.thumb-exit-active': {
    opacity: 0,
    transition: 'opacity 0.2s 0.5s cubic-bezier(0.4,0,0.2,1)',
  },
});

const ScrollbarThumb = styled.div<Omit<ScrollbarProps, 'onMouseDown'>>(
  ({ boxHeight, thumbTop, isDragging }) => ({
    width: '8px',
    height: `${boxHeight}px`,
    position: 'absolute',
    left: '3px',
    transform: `translate3d(0, ${thumbTop}px, 0)`,
    borderRadius: '12px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    '&:hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    ...(isDragging && {
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
    }),
  })
);

type ScrollbarProps = ScrollBoxSizes & {
  isVisible: boolean;
  isDragging: boolean;
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
};

type ScrollBoxSizes = {
  boxHeight: number;
  thumbTop: number;
};

const Scrollbar = (props: ScrollbarProps) => {
  return (
    <CSSTransition
      in={props.isVisible || props.isDragging}
      timeout={{
        appear: 200,
        enter: 200,
        exit: 700,
      }}
      classNames="thumb"
      unmountOnExit
    >
      <StyledScrollbar>
        <ScrollbarThumb {...props} />
      </StyledScrollbar>
    </CSSTransition>
  );
};

/**
 * Custom scroll container
 */
const Scroller = ({
  children,
  onScrollEnd,
  onScrollTop,
  page,
}: PropsWithChildren<{ onScrollEnd: () => void; onScrollTop: () => void; page: number }>) => {
  const [scrollBoxSizes, setScrollBoxSizes] = useState<ScrollBoxSizes>(scrollbarBoxSizes);
  const [isScrollbarVisible, setIsScrollbarVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [isLoadingPrev, setIsLoadingPrev] = useState(false);
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const lastScrollPosition = useRef<number>(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const loadingTimeoutRef = useRef<NodeJS.Timeout>();

  // Memoized update function
  const update = useCallback(() => {
    if (!scrollHostRef.current) return;

    const scrollHostElement = scrollHostRef.current;
    const { clientHeight, scrollHeight } = scrollHostElement;
    const scrollThumbPercentage = clientHeight / scrollHeight;
    const scrollThumbHeight = Math.max(SCROLL_BOX_MIN_HEIGHT, scrollThumbPercentage * clientHeight);

    setScrollBoxSizes(prev => {
      if (Math.abs(prev.boxHeight - scrollThumbHeight) < 1) return prev;
      return { ...prev, boxHeight: scrollThumbHeight };
    });
  }, []);

  useResizeObserver(scrollHostRef, update);

  const handleMouseEnter = () => {
    setIsScrollbarVisible(true);
  };

  const handleMouseLeave = () => {
    if (!isDragging) {
      setIsScrollbarVisible(false);
    }
  };

  // Optimized scroll handler with better throttling
  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (!scrollHostRef.current) return;

    const scrollHostElement = scrollHostRef.current;
    const { scrollTop, scrollHeight, offsetHeight } = scrollHostElement;

    // Update scrollbar thumb position only if significant change
    const newTop = (scrollTop / scrollHeight) * offsetHeight;
    const clampedTop = Math.min(newTop, offsetHeight - scrollBoxSizes.boxHeight);

    // Use requestAnimationFrame for smoother updates
    requestAnimationFrame(() => {
      setScrollBoxSizes(prev => {
        if (Math.abs(prev.thumbTop - clampedTop) < 2) return prev;
        return { ...prev, thumbTop: clampedTop };
      });
    });

    // Clear any pending scroll timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Reduced timeout for more responsive detection
    scrollTimeoutRef.current = setTimeout(() => {
      const atBottom = scrollHeight - scrollTop - offsetHeight <= SCROLL_THRESHOLD;
      const atTop = scrollTop <= SCROLL_THRESHOLD;

      if (atBottom && !isLoadingNext && onScrollEnd) {
        setIsLoadingNext(true);
        onScrollEnd();
        
        // Reset loading state after delay
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        loadingTimeoutRef.current = setTimeout(() => {
          setIsLoadingNext(false);
        }, 500); // Reduced timeout
      }

      if (atTop && !isLoadingPrev && onScrollTop) {
        setIsLoadingPrev(true);
        onScrollTop();
        
        // Reset loading state after delay
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        loadingTimeoutRef.current = setTimeout(() => {
          setIsLoadingPrev(false);
        }, 500); // Reduced timeout
      }
    }, SCROLL_DEBOUNCE_DELAY);
  }, [scrollBoxSizes.boxHeight, isLoadingNext, isLoadingPrev, onScrollEnd, onScrollTop]);

  const handleScrollThumbMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    lastScrollPosition.current = event.clientY;
    setIsDragging(true);
  };

  const handleDocumentMouseUp = useCallback((e: DocumentEventMap['mouseup']) => {
    if (isDragging) {
      e.preventDefault();
      setIsDragging(false);
      setIsScrollbarVisible(false);
    }
  }, [isDragging]);

  // Optimized mouse move handler with throttling
  const handleDocumentMouseMove = useCallback(
    (e: DocumentEventMap['mousemove']) => {
      if (!isDragging || !scrollHostRef.current) return;

      e.preventDefault();
      e.stopPropagation();

      // Use requestAnimationFrame for smoother dragging
      requestAnimationFrame(() => {
        if (!scrollHostRef.current) return;

        const scrollHostElement = scrollHostRef.current;
        const { scrollHeight, offsetHeight } = scrollHostElement;
        const { boxHeight, thumbTop } = scrollBoxSizes;

        const deltaY = e.clientY - lastScrollPosition.current;
        const percentage = deltaY * (scrollHeight / offsetHeight);

        const newThumbTop = Math.min(
          Math.max(0, thumbTop + deltaY),
          offsetHeight - boxHeight
        );

        setScrollBoxSizes(prev => ({
          ...prev,
          thumbTop: newThumbTop,
        }));

        lastScrollPosition.current = e.clientY;

        scrollHostElement.scrollTop = Math.min(
          Math.max(0, scrollHostElement.scrollTop + percentage),
          scrollHeight - offsetHeight
        );
      });
    },
    [isDragging, scrollBoxSizes]
  );

  // Optimized event listener setup
  useEffect(() => {
    const scrollHostElement = scrollHostRef.current;
    if (!scrollHostElement) return;

    // Use passive listeners for better performance
    const handleScrollEvent = (e: Event) => handleScroll(e as any);
    
    scrollHostElement.addEventListener('scroll', handleScrollEvent, { 
      passive: true,
      capture: false
    });
    
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      scrollHostElement.removeEventListener('scroll', handleScrollEvent);
    };
  }, [handleScroll]);

  // Optimized children change handler
  useEffect(() => {
    // Use requestAnimationFrame to avoid blocking the main thread
    requestAnimationFrame(() => {
      update();
    });
  }, [children, update]);

  // Reset loading states when page changes
  useEffect(() => {
    setIsLoadingNext(false);
    setIsLoadingPrev(false);
  }, [page]);

  // Optimized document event listeners
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => handleDocumentMouseMove(e);
    const handleMouseUp = (e: MouseEvent) => handleDocumentMouseUp(e);

    document.addEventListener('mousemove', handleMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp, { passive: true });
    document.addEventListener('mouseleave', handleMouseUp, { passive: true });
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [isDragging, handleDocumentMouseMove, handleDocumentMouseUp]);

  return (
    <ScrollHostContainer
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <ScrollHost ref={scrollHostRef}>{children}</ScrollHost>
      <Scrollbar
        {...scrollBoxSizes}
        isVisible={isScrollbarVisible}
        isDragging={isDragging}
        onMouseDown={handleScrollThumbMouseDown}
      />
    </ScrollHostContainer>
  );
};

export default Scroller;
