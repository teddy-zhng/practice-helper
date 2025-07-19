import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';

// Common BPM values from the image
const COMMON_BPMS = [44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 138, 144, 152, 160, 168, 176, 184, 200, 208];


// Main click sound mapping
const MAIN_CLICKS = [
  { type: 'perc_chair_lo', label: 'Click 1', color: '#9c27b0', file: `${import.meta.env.BASE_URL}metronome_sounds/Perc_Chair_lo.wav` },
  { type: 'perc_metronome_quartz_lo', label: 'Click 2', color: '#795548', file: `${import.meta.env.BASE_URL}metronome_sounds/Perc_MetronomeQuartz_lo.wav` },
  { type: 'synth_bell_a_hi', label: 'Click 3', color: '#ff9800', file: `${import.meta.env.BASE_URL}metronome_sounds/Synth_Bell_A_hi.wav` },
  { type: 'synth_square_d_hi', label: 'Click 4', color: '#00bcd4', file: `${import.meta.env.BASE_URL}metronome_sounds/Synth_Square_D_hi.wav` },
  { type: 'synth_weird_a_hi', label: 'Click 5', color: '#4caf50', file: `${import.meta.env.BASE_URL}metronome_sounds/Synth_Weird_A_hi.wav` },
] as const;

const Metronome: React.FC = () => {
  const [bpm, setBpm] = useState(88);
  const [isPlaying, setIsPlaying] = useState(false);
  const [, setBeat] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clickSoundType, setClickSoundType] = useState<string>(MAIN_CLICKS[0].type);
  const [customSoundFile, setCustomSoundFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [switching, setSwitching] = useState(false); // NEW: switching lock
  const synthRef = useRef<any>(null); // now can be Tone.Player
  const loopRef = useRef<Tone.Loop | null>(null);
  const beatCountRef = useRef(0);
  const [allSounds, setAllSounds] = useState<{file: string}[]>([]);
  const preloadedPlayers = useRef<{[file: string]: Tone.Player}>({});
  // Remove pulse state and effect
  const retryTimeoutRef = React.useRef<number | null>(null);

  // Preload main click sounds
  useEffect(() => {
    MAIN_CLICKS.forEach(({ file }) => {
      if (!preloadedPlayers.current[file]) {
        preloadedPlayers.current[file] = new Tone.Player({ url: file, autostart: false, volume: 0 }).toDestination();
      }
    });
  }, []);

  useEffect(() => {
    async function fetchSounds() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}metronome_sounds/index.json`);
        const files = await res.json();
        setAllSounds(files.map((f: string) => ({ file: `${import.meta.env.BASE_URL}metronome_sounds/` + f })));
      } catch (e) {
        setAllSounds([
          { file: `${import.meta.env.BASE_URL}metronome_sounds/Synth_Square_D_hi.wav` },
          { file: `${import.meta.env.BASE_URL}metronome_sounds/Perc_Chair_lo.wav` },
          { file: `${import.meta.env.BASE_URL}metronome_sounds/Perc_MetronomeQuartz_lo.wav` },
          { file: `${import.meta.env.BASE_URL}metronome_sounds/Synth_Bell_A_hi.wav` },
          { file: `${import.meta.env.BASE_URL}metronome_sounds/Synth_Weird_A_hi.wav` },
        ]);
      }
    }
    fetchSounds();
  }, []);

  const ALL_SOUNDS = allSounds.map(s => {
    const main = MAIN_CLICKS.find(m => m.file === s.file);
    return main ? { ...s, mainLabel: main.label } : s;
  });

  function getDisplayName(file: string) {
    const base = file.split('/').pop()?.replace(/\.wav$/i, '') || file;
    const main = MAIN_CLICKS.find(m => m.file === file);
    return main ? `${base} (${main.label})` : base;
  }

  const getCurrentSoundFile = () => {
    if (customSoundFile) return customSoundFile;
    const main = MAIN_CLICKS.find(m => m.type === clickSoundType);
    return main ? main.file : MAIN_CLICKS[0].file;
  };

  // Create player for selected click sound
  const createClickPlayer = useCallback((file: string, onLoad?: () => void) => {
    if (synthRef.current) {
      synthRef.current.dispose?.();
      synthRef.current = null;
    }
    // Use preloaded for main clicks
    if (MAIN_CLICKS.some(m => m.file === file) && preloadedPlayers.current[file]) {
      synthRef.current = preloadedPlayers.current[file];
      synthRef.current.volume.value = 0; // Ensure loud metronome
      if (onLoad) onLoad();
    } else {
      setIsLoading(true);
      synthRef.current = new Tone.Player({
        url: file,
        autostart: false,
        volume: 0, // Louder metronome
        onload: () => {
          setIsLoading(false);
          if (onLoad) onLoad();
        },
      }).toDestination();
    }
  }, []);

  // Utility to safely stop and dispose loop and player
  function cleanupAudio() {
    if (loopRef.current) {
      try {
        loopRef.current.stop(0);
      } catch {}
      try {
        loopRef.current.dispose();
      } catch {}
      loopRef.current = null;
    }
    if (synthRef.current) {
      try {
        synthRef.current.dispose?.();
      } catch {}
      synthRef.current = null;
    }
    try {
      Tone.Transport.stop();
      Tone.Transport.cancel();
    } catch {}
  }

  // Start the metronome
  const handleStart = useCallback(async () => {
    try {
      setError(null);
      setSwitching(true); // lock switching
      if (Tone.context.state !== 'running') {
        await Tone.start();
        await Tone.context.resume();
      } else {
        await Tone.start();
      }
      // Always clean up before starting
      cleanupAudio();
      // Only start after loading
      const file = getCurrentSoundFile();
      const startLoop = () => {
        Tone.Transport.bpm.value = bpm;
        beatCountRef.current = 0;
        setBeat(0);
        if (!loopRef.current) {
          loopRef.current = new Tone.Loop((time) => {
            if (synthRef.current && synthRef.current.loaded) {
              synthRef.current.start(time);
            }
            Tone.Draw.schedule(() => {
              setTimeout(() => {
                setBeat(() => {
                  const next = (beatCountRef.current % 4);
                  beatCountRef.current++;
                  return next;
                });
              }, 35);
            }, time);
          }, '4n');
        }
        loopRef.current.start(0);
        Tone.Transport.start();
        setSwitching(false); // unlock switching
        setIsPlaying(true); // <-- moved here, after everything is ready
      };
      if (MAIN_CLICKS.some(m => m.file === file) && preloadedPlayers.current[file]) {
        createClickPlayer(file);
        startLoop();
      } else {
        setIsLoading(true);
        createClickPlayer(file, () => {
          setIsLoading(false);
          startLoop();
        });
      }
    } catch {
      setError('oops! something went wrong! you may need to refresh the website');
      setIsPlaying(false);
      setIsLoading(false);
      setSwitching(false); // unlock switching on error
      if (!retryTimeoutRef.current) {
        retryTimeoutRef.current = window.setTimeout(() => {
          retryTimeoutRef.current = null;
          if (isPlaying) return;
          handleStart();
        }, 2000);
      }
    }
  }, [bpm, clickSoundType, createClickPlayer]);

  // Stop the metronome
  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setBeat(0);
    beatCountRef.current = 0;
    cleanupAudio();
    setSwitching(false); // unlock switching
  }, []);

  // Toggle play/stop
  const handleToggle = useCallback(async () => {
    if (isPlaying) {
      handleStop();
    } else {
      try {
        if (Tone.context.state !== 'running') {
          await Tone.start();
          await Tone.context.resume();
        }
        handleStart();
      } catch {
        setError('oops! something went wrong! you may need to refresh the website');
        // Start auto-retry
        if (!retryTimeoutRef.current) {
          retryTimeoutRef.current = window.setTimeout(() => {
            retryTimeoutRef.current = null;
            if (isPlaying) return;
            handleStart();
          }, 2000);
        }
      }
    }
  }, [isPlaying, handleStop, handleStart]);

  // Handle BPM change
  const handleBpmChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newBpm = Number(e.target.value);
    setBpm(newBpm);
    if (isPlaying) {
      Tone.Transport.bpm.value = newBpm;
    }
  }, [isPlaying]);

  const handleBpmButtonClick = useCallback((newBpm: number) => {
    setBpm(newBpm);
    if (isPlaying) {
      Tone.Transport.bpm.value = newBpm;
    }
  }, [isPlaying]);

  // When click sound type changes, update player if playing
  useEffect(() => {
    if (isPlaying && !switching) {
      handleStop();
      setTimeout(() => handleStart(), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickSoundType, customSoundFile]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div 
      style={{ 
        padding: '2vw 1vw',
        border: '1px solid #ccc',
        borderRadius: 8,
        cursor: 'pointer',
        backgroundColor: isPlaying ? '#f0f8ff' : '#fff',
        transition: 'background-color 0.2s ease',
        width: '100%',
        maxWidth: 500,
        minWidth: 260,
        height: '85vh',
        maxHeight: '85vh',
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        boxSizing: 'border-box',
      }}
      onClick={handleToggle}
    >
      <h2 style={{ fontSize: '1.5rem', margin: '0 0 8px 0' }}>Metronome</h2>
      <div style={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 'clamp(8px, 1.5vw, 16px)',
        width: '100%',
        maxWidth: 420,
        minWidth: 220,
        fontSize: 'clamp(12px, 1.2vw, 16px)',
        padding: 'clamp(4px, 1vw, 16px)',
        boxSizing: 'border-box',
      }}>
        {/* BPM buttons */}
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          width: '100%',
          maxWidth: 380,
          gap: 0,
        }}>
          {COMMON_BPMS.map((bpmValue) => (
            <button
              key={bpmValue}
              onClick={(e) => {
                e.stopPropagation();
                handleBpmButtonClick(bpmValue);
              }}
              style={{
                padding: '6px 2px',
                fontSize: '11px',
                border: 'none',
                borderRadius: '0px',
                backgroundColor: bpm === bpmValue ? '#4caf50' : '#e8e8e8',
                color: bpm === bpmValue ? 'white' : '#333',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minHeight: '34px',
                margin: '0px',
              }}
              aria-label={`Set BPM to ${bpmValue}`}
            >
              {bpmValue}
            </button>
          ))}
        </div>

        {/* Custom BPM input */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '15px',
        }}>
          <label>
            Custom:
            <input
              type="number"
              min={30}
              max={300}
              value={bpm}
              onChange={handleBpmChange}
              style={{ 
                width: 60,
                marginLeft: 6,
                fontSize: '15px',
                padding: '3px 6px',
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Set custom metronome BPM"
            />
          </label>
        </div>

        {/* Beat indicator and current BPM display */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '16px',
        }}>
          
        </div>
        {/* Click sound type buttons */}
        <div style={{ 
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          maxWidth: 380,
          marginTop: 6,
        }}>
          {MAIN_CLICKS.map(({ type, label, color }) => (
            <button
              key={type}
              onClick={e => {
                e.stopPropagation();
                if (switching || isLoading) return;
                if (isPlaying) {
                  handleStop();
                  setClickSoundType(type);
                  setCustomSoundFile(null);
                  setTimeout(() => handleStart(), 100);
                } else {
                  setClickSoundType(type);
                  setCustomSoundFile(null);
                }
              }}
              style={{
                padding: '5px 6px',
                fontSize: '11px',
                border: 'none',
                borderRadius: '0px',
                backgroundColor: !customSoundFile && clickSoundType === type ? color : '#e8e8e8',
                color: !customSoundFile && clickSoundType === type ? 'white' : '#333',
                cursor: switching || isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '38px',
                margin: '0px',
                flex: 1,
              }}
              aria-label={`Select ${label} click sound`}
              disabled={isLoading || switching}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Dropdown for all sounds */}
        <div style={{ marginTop: 8, width: '100%', maxWidth: 420, display: 'flex', justifyContent: 'center' }}>
          <select
            value={customSoundFile || getCurrentSoundFile()}
            onChange={e => {
              if (switching || isLoading) return;
              const val = e.target.value;
              if (MAIN_CLICKS.some(m => m.file === val)) {
                if (isPlaying) {
                  handleStop();
                  setClickSoundType(MAIN_CLICKS.find(m => m.file === val)!.type);
                  setCustomSoundFile(null);
                  setTimeout(() => handleStart(), 100);
                } else {
                  setClickSoundType(MAIN_CLICKS.find(m => m.file === val)!.type);
                  setCustomSoundFile(null);
                }
              } else {
                if (isPlaying) {
                  handleStop();
                  setIsLoading(true);
                  setCustomSoundFile(val);
                  // Wait for loading before allowing another change
                  createClickPlayer(val, () => {
                    setIsLoading(false);
                    handleStart();
                  });
                } else {
                  setIsLoading(true);
                  setCustomSoundFile(val);
                  createClickPlayer(val, () => setIsLoading(false));
                }
              }
            }}
            style={{ fontSize: 13, padding: '3px 6px', width: '100%', maxWidth: 320 }}
            aria-label="Select metronome sound"
            disabled={isLoading || switching}
          >
            {ALL_SOUNDS.map((s) => (
              <option key={s.file} value={s.file}>
                {getDisplayName(s.file)}
              </option>
            ))}
          </select>
          {isLoading && <span style={{ marginLeft: 8, fontSize: 13 }}>Loading...</span>}
        </div>
        {/* Info blurb about metronome sounds */}
        <div
          style={{
            marginTop: 4,
            width: '100%',
            maxWidth: 320,
            fontSize: 10,
            color: '#888',
            fontStyle: 'italic',
            textAlign: 'center',
            lineHeight: 1.4,
            wordBreak: 'break-word',
            whiteSpace: 'normal',
            overflowWrap: 'break-word',
          }}
        >
          metronome sounds recorded by Ludwig Peter Müller<br />
          for use under Creative Commons CC0 1.0 Universal
        </div>
        {error && <div style={{ color: 'red', fontSize: '14px', textAlign: 'center' }}>{error}</div>}
      </div>
    </div>
  );
};

export default Metronome; 