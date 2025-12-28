import React, { useState, useEffect, useCallback, useRef } from 'react';
import Tuner from './components/Tuner';
import Drone from './components/Drone';
import Metronome from './components/Metronome';
import './App.css';

const hintMessages = [
  'click anywhere on a tool to turn it on/off.',
  'all of the tools can be used simultaneously.',
  'an external speaker is recommended to best use the drone.',
  'try using multi-note drones!',
  'permanently allow microphone for this site in your browser settings',
  'tuner markings include just temperament!',
  'choose from 122 metronome sounds!',
  'this website helps avoid phone usage during practicing.',
  '\"drone\" comes from the old english drǣn, meaning male bee.',
  'the tuner is not very forgiving...',
  'what do you call two violists playing the same note? a minor second.',
  'stop clicking me and get back to practicing!',
];

const App: React.FC = () => {
  // State for Tuner
  const [tunerNote, setTunerNote] = useState<string | null>(null);
  const [tunerCents, setTunerCents] = useState<number | null>(null);
  
  // Hint state
  const [isHintExpanded, setIsHintExpanded] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);

  // Audio unlock state
  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Ref to ensure hint is only auto-shown once
  const hasAutoShownHint = useRef(false);

  const showHintTimeoutRef = useRef<number | null>(null);
  const hideHintTimeoutRef = useRef<number | null>(null);

  const clearHintTimeout = useCallback(() => {
    if (showHintTimeoutRef.current) {
      clearTimeout(showHintTimeoutRef.current);
      showHintTimeoutRef.current = null;
    }
    if (hideHintTimeoutRef.current) {
      clearTimeout(hideHintTimeoutRef.current);
      hideHintTimeoutRef.current = null;
    }
  }, []);

  const handleHintClick = useCallback(() => {
    if (isHintExpanded) {
      setIsHintExpanded(false);
      clearHintTimeout();
      return;
    }
    setHintIndex((prev) => (prev + 1) % hintMessages.length);
    clearHintTimeout();
    setIsHintExpanded(true);
    hideHintTimeoutRef.current = window.setTimeout(() => {
      setIsHintExpanded(false);
    }, 3000);
  }, [isHintExpanded, clearHintTimeout]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearHintTimeout();
    };
  }, [clearHintTimeout]);

  // Only show popup if not ready
  const shouldShowPopup = !audioReady;

  // const [tooSmall, setTooSmall] = useState(false);

  // Show hint automatically on first load (after popup if applicable)
  useEffect(() => {
    if (!shouldShowPopup && !hasAutoShownHint.current) {
      setHintIndex(0); // Always start with the first hint
      clearHintTimeout();
      // Delay showing the hint by 1 second
      showHintTimeoutRef.current = window.setTimeout(() => {
        setIsHintExpanded(true);
        hideHintTimeoutRef.current = window.setTimeout(() => {
          setIsHintExpanded(false);
        }, 7000);
      }, 1000);
      hasAutoShownHint.current = true;
    }
  }, [shouldShowPopup, clearHintTimeout]);

  // Tap to start overlay handler
  const handleAudioUnlock = useCallback(async () => {
    try {
      // Try to unlock Tone.js context (for Metronome/Drone)
      const Tone = await import('tone');
      if (Tone.context.state !== 'running') {
        await Tone.start();
        await Tone.context.resume();
      }
      setAudioReady(true);
      setAudioError(null);
    } catch {
      setAudioError('Please refresh and try again.');
    }
  }, []);

  // useEffect(() => {
  //   function handleResize() {
  //     setTooSmall(window.innerWidth < 956 || window.innerHeight < 600);
  //   }
  //   handleResize();
  //   window.addEventListener('resize', handleResize);
  //   return () => window.removeEventListener('resize', handleResize);
  // }, []);

  // if (tooSmall) {
  //   return (
  //     <div style={{
  //       width: '100vw',
  //       height: '100vh',
  //       display: 'flex',
  //       justifyContent: 'center',
  //       alignItems: 'center',
  //       fontSize: '2rem',
  //       color: '#888',
  //       background: '#fff',
  //       textAlign: 'center',
  //     }}>
  //       screen too small<br />
  //       the point of this website is to not use your phone!
  //     </div>
  //   );
  // }

  return (
    <>
      {shouldShowPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.35)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={handleAudioUnlock}
        onTouchStart={handleAudioUnlock}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 2px 16px rgba(0,0,0,0.18)',
              padding: '32px 36px',
              minWidth: 600,
              textAlign: 'center',
              fontSize: 22,
              color: '#333',
              cursor: 'pointer',
              userSelect: 'none',
              maxWidth: '90vw',
            }}
          >
            <div style={{ fontSize: 40, fontWeight: 600, marginBottom: 4}}>needtopractice</div>
            <div style={{ fontSize: 30, marginBottom: 4}}>
              a 3-in-1 practicing tool
            </div>
            <div style={{ fontSize: 14, marginBottom: 60}}>
              (tuner, drone, and metronome)
            </div>
            <div style={{ fontSize: 30, fontWeight: 600, marginBottom: 2 }}>
              instructions
            </div>
            <div style={{ fontSize: 20, marginBottom: 10}}>
              select a tool to turn it on/off:
            </div>
            <div style={{ marginBottom: 50, display: 'flex', justifyContent: 'center' }}>
              <img 
                src={`${import.meta.env.BASE_URL}demo.jpg`} 
                alt="Demo" 
                style={{ 
                  maxWidth: '15%', 
                  height: 'auto', 
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }} 
              />
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 2}}>
              for best experience: 
            </div>
            <div style={{ fontSize: 20, marginBottom: 2}}>
              use a tablet or computer
            </div>
            <div style={{ fontSize: 20, marginBottom: 2}}>
              with an external speaker
            </div>
            <div style={{ fontSize: 20, marginBottom: 60}}>
              (issues may occur on safari browser)
            </div>
            <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
              click anywhere to continue
            </div>
            {audioError && <div style={{ color: 'red', fontSize: 15, marginTop: 16 }}>{audioError}</div>}
          </div>
        </div>
      )}
      <div className="app-flex" style={{ filter: shouldShowPopup ? 'blur(2px)' : undefined }}>
        <button 
          className={`hint ${isHintExpanded ? 'expanded' : ''}`}
          onClick={handleHintClick}
          aria-label="Toggle hint information"
          type="button"
        >
          <span className="hint-text">{hintMessages[hintIndex]}</span>
          <svg className="info-icon" width="20" height="20" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1" fill="none"/>
            <text x="7" y="9.5" textAnchor="middle" fontSize="8" fill="currentColor" fontWeight="bold">i</text>
          </svg>
        </button>
        {/* Socials bar */}
        <div className="socials-bar">
          <a href="https://www.instagram.com/teddysbassoon/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="social-icon">
            <img src={`${import.meta.env.BASE_URL}social_icons/instagram-brands-solid.svg`} alt="Instagram" width={20} height={20} className="social-icon" />
          </a>
          <a href="https://www.youtube.com/@teddysbassoon" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="social-icon">
            <img src={`${import.meta.env.BASE_URL}social_icons/youtube-brands.svg`} alt="YouTube" width={20} height={20} className="social-icon" />
          </a>
          <a href="https://github.com/teddy-zhng/practice-helper" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="social-icon">
            <img src={`${import.meta.env.BASE_URL}social_icons/github-brands.svg`} alt="GitHub" width={20} height={20} className="social-icon" />
          </a>
        </div>
        {/* Bottom center info blurb */}
        <div className="bottom-blurb">
          needtopractice is completely free to use. <a
            href="https://coff.ee/teddyzhng"
            target="_blank"
            rel="noopener noreferrer"
            className="bottom-blurb-link"
            aria-label="Support this site on coff.ee"
          >
            support this site here
          </a>
        </div>
        <div className="column">
          <Tuner 
            note={tunerNote}
            cents={tunerCents}
            setNote={setTunerNote}
            setCents={setTunerCents}
          />
        </div>
        <div className="column">
          <Drone />
        </div>
        <div className="column">
          <Metronome />
        </div>
      </div>
    </>
  );
};

export default App;
