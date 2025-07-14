import { useCallback, useEffect, useRef, useState } from 'react';

export interface ScrollManagerOptions {
  pageSize?: number;
  windowSize?: number;
  bufferPages?: number;
}

export interface ScrollState {
  currentPage: number;
  windowStartPage: number;
  windowEndPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  isLoading: boolean;
}

export interface ScrollManagerResult {
  scrollState: ScrollState;
  setPage: (page: number) => void;
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  scrollToPage: (page: number) => void;
  isScrolling: boolean;
}

/**
 * Advanced scroll manager that handles windowed pagination without scroll jumps
 * Uses a hybrid approach: infinite loading for initial pages, then sliding window
 */
export function useScrollManager(
  text: string,
  options: ScrollManagerOptions = {}
): ScrollManagerResult {
  const {
    pageSize = 4000,
    windowSize = 7,
    bufferPages = 2
  } = options;

  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const isRestoringScrollRef = useRef(false);
  const previousScrollInfoRef = useRef<{
    scrollTop: number;
    scrollHeight: number;
    contentHeight: number;
  } | null>(null);

  // Handle empty text case
  const safeText = text || "";
  const totalPages = Math.max(1, Math.ceil(safeText.length / pageSize));
  const halfWindow = Math.floor(windowSize / 2);
  
  // Calculate window boundaries with smooth transitions
  const calculateWindow = useCallback((page: number) => {
    // Handle edge cases
    if (!safeText || safeText.length === 0) {
      return {
        windowStartPage: 1,
        windowEndPage: 1,
        startIndex: 0,
        endIndex: 0
      };
    }

    // For the first few pages, use infinite loading approach
    if (page <= windowSize) {
      return {
        windowStartPage: 1,
        windowEndPage: Math.min(page + bufferPages, totalPages),
        startIndex: 0,
        endIndex: Math.min(safeText.length, (page + bufferPages) * pageSize)
      };
    }
    
    // For later pages, use sliding window but with overlap to prevent jumps
    const idealWindowStart = Math.max(1, page - halfWindow);
    const idealWindowEnd = Math.min(totalPages, page + halfWindow);
    
    // Ensure minimum window size
    let windowStart = idealWindowStart;
    let windowEnd = idealWindowEnd;
    
    if (windowEnd - windowStart + 1 < windowSize) {
      if (windowStart === 1) {
        windowEnd = Math.min(totalPages, windowStart + windowSize - 1);
      } else if (windowEnd === totalPages) {
        windowStart = Math.max(1, windowEnd - windowSize + 1);
      }
    }
    
    return {
      windowStartPage: windowStart,
      windowEndPage: windowEnd,
      startIndex: (windowStart - 1) * pageSize,
      endIndex: Math.min(safeText.length, windowEnd * pageSize)
    };
  }, [safeText.length, totalPages, pageSize, windowSize, halfWindow, bufferPages]);

  const { windowStartPage, windowEndPage, startIndex, endIndex } = calculateWindow(currentPage);

  const scrollState: ScrollState = {
    currentPage,
    windowStartPage,
    windowEndPage,
    totalPages,
    startIndex,
    endIndex,
    isLoading
  };

  // Smooth scroll position restoration
  const restoreScrollPosition = useCallback(() => {
    if (!scrollElementRef.current || !previousScrollInfoRef.current) return;

    const scrollElement = scrollElementRef.current;
    const previousInfo = previousScrollInfoRef.current;
    
    // Calculate the content height change
    const currentContentHeight = scrollElement.scrollHeight;
    const heightDifference = currentContentHeight - previousInfo.contentHeight;
    
    // If content was added at the top, adjust scroll position
    if (heightDifference > 0) {
      const newScrollTop = previousInfo.scrollTop + heightDifference;
      scrollElement.scrollTop = Math.max(0, newScrollTop);
    } else if (heightDifference < 0) {
      // If content was removed from top, adjust accordingly
      const newScrollTop = Math.max(0, previousInfo.scrollTop + heightDifference);
      scrollElement.scrollTop = newScrollTop;
    }
    
    // Clear the restoration flag after a short delay
    setTimeout(() => {
      isRestoringScrollRef.current = false;
    }, 100);
  }, []);

  // Handle page changes with scroll position preservation
  const setPage = useCallback((page: number) => {
    if (page === currentPage || page < 1 || page > totalPages) return;
    
    // Store current scroll information before page change
    if (scrollElementRef.current) {
      previousScrollInfoRef.current = {
        scrollTop: scrollElementRef.current.scrollTop,
        scrollHeight: scrollElementRef.current.scrollHeight,
        contentHeight: scrollElementRef.current.scrollHeight
      };
    }
    
    setIsLoading(true);
    isRestoringScrollRef.current = true;
    
    setCurrentPage(page);
    
    // Restore scroll position after React renders
    setTimeout(() => {
      restoreScrollPosition();
      setIsLoading(false);
    }, 50);
  }, [currentPage, totalPages, restoreScrollPosition]);

  // Smooth scroll to specific page
  const scrollToPage = useCallback((targetPage: number) => {
    if (targetPage < 1 || targetPage > totalPages) return;
    
    // If target page is outside current window, load it first
    if (targetPage < windowStartPage || targetPage > windowEndPage) {
      setPage(targetPage);
      
      // After loading, scroll to the approximate position
      setTimeout(() => {
        if (scrollElementRef.current) {
          const targetPosition = ((targetPage - windowStartPage) / (windowEndPage - windowStartPage)) 
            * scrollElementRef.current.scrollHeight;
          scrollElementRef.current.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
          });
        }
      }, 100);
    } else {
      // Target page is in current window, just scroll to it
      if (scrollElementRef.current) {
        const targetPosition = ((targetPage - windowStartPage) / (windowEndPage - windowStartPage)) 
          * scrollElementRef.current.scrollHeight;
        scrollElementRef.current.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    }
  }, [windowStartPage, windowEndPage, totalPages, setPage]);

  // Handle scroll events with intelligent page loading
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (isRestoringScrollRef.current || isLoading) return;
    
    const scrollElement = event.currentTarget;
    scrollElementRef.current = scrollElement;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    const scrollPercentage = scrollTop / (scrollHeight - clientHeight);
    
    // Set scrolling state
    setIsScrolling(true);
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Reset scrolling state after scroll ends
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
    
    // Determine if we need to load more pages
    const distanceFromTop = scrollTop;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    
    // Load next page when near bottom
    if (distanceFromBottom < 300 && currentPage < totalPages) {
      setPage(currentPage + 1);
    }
    
    // Load previous page when near top (only for windowed approach)
    if (distanceFromTop < 300 && currentPage > 1 && windowStartPage > 1) {
      setPage(currentPage - 1);
    }
  }, [isLoading, currentPage, totalPages, windowStartPage, setPage]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    scrollState,
    setPage,
    handleScroll,
    scrollToPage,
    isScrolling
  };
}

export default useScrollManager;
