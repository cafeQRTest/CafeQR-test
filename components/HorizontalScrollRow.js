import React, { useRef, useState, useEffect } from 'react';

export default function HorizontalScrollRow({ title, items, renderItem, count = 0 }) {
  const scrollRef = useRef(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeft(scrollLeft > 5); // Slight buffer
    // floating point tolerance
    setShowRight(scrollLeft < scrollWidth - clientWidth - 5); 
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    // Timeout to check after rendering layout
    setTimeout(checkScroll, 500);
    return () => window.removeEventListener('resize', checkScroll);
  }, [items]);

  const scroll = (direction) => {
    if (!scrollRef.current) return;
    const { clientWidth } = scrollRef.current;
    // Scroll by 70% of view width
    const scrollAmount = direction === 'left' ? -clientWidth * 0.7 : clientWidth * 0.7;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="horizontal-row-container" style={{ position: 'relative', marginBottom: 24, isolation: 'isolate' }}>
      {title && (
        <h2 style={{ margin: '0 0 12px 20px', fontSize: 19, fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>
          {title} {count > 0 && <span style={{ opacity: 0.5, fontSize: '0.85em', fontWeight: 500 }}>({count})</span>}
        </h2>
      )}
      
      <div style={{ position: 'relative', paddingBottom: 8 }}>
        {/* Left Gradient & Button */}
        {showLeft && (
          <>
            <button
              onClick={() => scroll('left')}
              className="scroll-btn"
              style={{
                position: 'absolute', left: 0, top: '80px', transform: 'translateY(-50%)',
                zIndex: 100, width: 48, height: 80, 
                background: 'transparent', 
                border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', transition: 'all 0.2s ease',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))'
              }}
              aria-label="Scroll Left"
            >
               <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </>
        )}

        {/* Scroll Container */}
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="netflix-scroll"
          style={{
            display: 'flex',
            overflowX: 'auto',
            gap: 12,
            padding: '4px 20px 24px 20px', 
            scrollBehavior: 'smooth',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            scrollSnapType: 'x mandatory'
          }}
        >
          {items.map((item, index) => (
             <div key={item.id || index} style={{ flex: '0 0 auto', scrollSnapAlign: 'start' }}>
                {renderItem(item)}
             </div>
          ))}
          <div style={{ width: 40, flex: '0 0 auto' }}></div>
        </div>

        {/* Right Gradient & Button */}
        {showRight && (
          <>
            <button
              onClick={() => scroll('right')}
              className="scroll-btn"
              style={{
                position: 'absolute', right: 0, top: '80px', transform: 'translateY(-50%)',
                zIndex: 100, width: 48, height: 80,
                background: 'transparent',
                border: 'none', 
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', transition: 'all 0.2s ease',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))'
              }}
              aria-label="Scroll Right"
            >
               <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </>
        )}
      </div>
      <style jsx>{`
        .netflix-scroll::-webkit-scrollbar { display: none; }
        .scroll-btn:hover {
          transform: translateY(-50%) scale(1.15) !important;
          color: #fff !important;
        }
        .scroll-btn:active {
          transform: translateY(-50%) scale(0.95) !important;
        }
      `}</style>
    </div>
  );
}
