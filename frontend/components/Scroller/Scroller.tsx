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
const SCROLL_THRESHOLD = 100; // Increased threshold for better detection
const SCROLL_DEBOUNCE_DELAY = 150; // Debounce delay for scroll events

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

  // Debounced scroll handler
  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (!scrollHostRef.current) return;

    const scrollHostElement = scrollHostRef.current;
    const { scrollTop, scrollHeight, offsetHeight } = scrollHostElement;

    // Update scrollbar thumb position
    const newTop = (scrollTop / scrollHeight) * offsetHeight;
    const clampedTop = Math.min(newTop, offsetHeight - scrollBoxSizes.boxHeight);

    setScrollBoxSizes(prev => {
      if (Math.abs(prev.thumbTop - clampedTop) < 1) return prev;
      return { ...prev, thumbTop: clampedTop };
    });

    // Clear any pending scroll timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Set a new timeout for scroll position detection
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
        }, 1000);
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
        }, 1000);
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

  const handleDocumentMouseMove = useCallback(
    (e: DocumentEventMap['mousemove']) => {
      if (isDragging && scrollHostRef.current) {
        e.preventDefault();
        e.stopPropagation();

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
      }
    },
    [isDragging, scrollBoxSizes]
  );

  // Clean up event listeners and timers
  useEffect(() => {
    const scrollHostElement = scrollHostRef.current;
    if (!scrollHostElement) return;

    scrollHostElement.addEventListener('scroll', handleScroll as any, { passive: true });
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      scrollHostElement.removeEventListener('scroll', handleScroll as any);
    };
  }, [handleScroll]);

  useEffect(() => {
    update();
  }, [children, update]);

  // Reset loading states when page changes
  useEffect(() => {
    setIsLoadingNext(false);
    setIsLoadingPrev(false);
  }, [page]);

  useEffect(() => {
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);
    document.addEventListener('mouseleave', handleDocumentMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
      document.removeEventListener('mouseleave', handleDocumentMouseUp);
    };
  }, [handleDocumentMouseMove, handleDocumentMouseUp]);

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
