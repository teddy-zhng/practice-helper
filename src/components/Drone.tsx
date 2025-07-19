import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVES = [2, 3, 4, 5, 6];

type SoundType = 'pure' | 'retro' | '"brass"' | 'tuning';

const Drone: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [noteOctaves, setNoteOctaves] = useState<number[]>([3]);
  const [maxNotes, setMaxNotes] = useState(1);
  const [octave] = useState(3);
  const [soundType, setSoundType] = useState<SoundType>('tuning');
  const [error, setError] = useState<string | null>(null);
  const synthRefs = useRef<(Tone.Synth | Tone.MonoSynth | null)[]>([]);
  const retryTimeoutRef = useRef<number | null>(null);

  const createSynth = useCallback((type: SoundType) => {
    // Dispose all existing synths
    synthRefs.current.forEach(synth => {
      if (synth) {
        synth.dispose();
      }
    });
    synthRefs.current = [];
    
    switch (type) {
      case 'retro':
        // Create up to 3 synths for retro wave
        for (let i = 0; i < 3; i++) {
          const synth = new Tone.Synth({
            oscillator: {
              type: 'square'
            }
          }).toDestination();
          synthRefs.current.push(synth);
        }
        break;
      case '"brass"':
        // Create up to 3 synths for "brass" sound
        for (let i = 0; i < 3; i++) {
          const synth = new Tone.MonoSynth({
            oscillator: {
              type: 'sawtooth'
            },
            filterEnvelope: {
              attack: 0.1,
              decay: 0.2,
              sustain: 0.9,
              release: 1.0
            },
            envelope: {
              attack: 0.1,
              decay: 0.2,
              sustain: 0.9,
              release: 1.0
            }
          }).toDestination();
          synthRefs.current.push(synth);
        }
        break;
      case 'tuning':
        // Create up to 3 synths for tuning drone (triangle wave)
        for (let i = 0; i < 3; i++) {
          const synth = new Tone.Synth({
            oscillator: {
              type: 'triangle'
            },
            envelope: {
              attack: 0.05,
              decay: 0.1,
              sustain: 0.8,
              release: 1.0
            }
          }).toDestination();
          synthRefs.current.push(synth);
        }
        break;
      default: // pure
        // Create up to 3 synths for pure wave
        for (let i = 0; i < 3; i++) {
          const synth = new Tone.Synth().toDestination();
          synthRefs.current.push(synth);
        }
        break;
    }
  }, []);

  const stop = useCallback(() => {
    synthRefs.current.forEach(synth => {
      if (synth) {
        synth.triggerRelease();
        synth.dispose();
      }
    });
    synthRefs.current = [];
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // Resume Tone context on tab visibility change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && Tone.context.state !== 'running') {
        await Tone.start();
        await Tone.context.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleStart = useCallback(async () => {
    try {
      setError(null);
      if (Tone.context.state !== 'running') {
        await Tone.start();
        await Tone.context.resume();
      } else {
        await Tone.start();
      }
      createSynth(soundType); // This always creates new synths
      
      // Start all selected notes with their respective octaves
      selectedNotes.forEach((note, index) => {
        if (synthRefs.current[index]) {
          const noteOctave = noteOctaves[index] || octave;
          synthRefs.current[index]?.triggerAttack(`${note}${noteOctave}`);
        }
      });
      
      setIsPlaying(true);
    } catch {
      setError('oops! something went wrong! you may need to refresh the website');
      setIsPlaying(false);
      // Start auto-retry
      if (!retryTimeoutRef.current) {
        retryTimeoutRef.current = window.setTimeout(() => {
          retryTimeoutRef.current = null;
          if (isPlaying) return; // Only retry if still enabled
          handleStart();
        }, 2000);
      }
    }
  }, [selectedNotes, noteOctaves, maxNotes, octave, soundType, createSynth]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleNoteChange = useCallback((newNote: string) => {
    setSelectedNotes(prevNotes => {
      let newNotes: string[];
      
      if (prevNotes.includes(newNote)) {
        // If note is already selected, remove it
        const idx = prevNotes.indexOf(newNote);
        newNotes = [...prevNotes.slice(0, idx), ...prevNotes.slice(idx + 1)];
      } else if (prevNotes.length < maxNotes) {
        // If less than max notes selected, add the new note
        newNotes = [...prevNotes, newNote];
      } else {
        // If max notes already selected, replace the first note
        newNotes = [...prevNotes.slice(1), newNote];
      }
      
      // Do not change noteOctaves here; octaves are per slot
      // Update playing notes if currently playing
      if (isPlaying) {
        // Stop all current notes
        synthRefs.current.forEach(synth => {
          if (synth) {
            synth.triggerRelease();
          }
        });
        
        // Start new notes with their respective octaves
        newNotes.forEach((note, index) => {
          if (synthRefs.current[index]) {
            const noteOctave = noteOctaves[index] || octave;
            synthRefs.current[index]?.triggerAttack(`${note}${noteOctave}`);
          }
        });
      }
      
      return newNotes;
    });
  }, [isPlaying, maxNotes, octave, noteOctaves]);

  const handleMaxNotesChange = useCallback((newMaxNotes: number) => {
    setMaxNotes(newMaxNotes);
    
    setNoteOctaves(prevOctaves => {
      if (prevOctaves.length < newMaxNotes) {
        // Add more octaves, default to current octave
        return [...prevOctaves, ...Array(newMaxNotes - prevOctaves.length).fill(octave)];
      } else if (prevOctaves.length > newMaxNotes) {
        // Remove excess octaves
        return prevOctaves.slice(0, newMaxNotes);
      }
      return prevOctaves;
    });
    // If current selection exceeds new max, remove excess notes
    if (selectedNotes.length > newMaxNotes) {
      const trimmedNotes = selectedNotes.slice(-newMaxNotes);
      setSelectedNotes(trimmedNotes);
      // If playing, stop all synths and restart only the trimmed notes
      if (isPlaying) {
        synthRefs.current.forEach(synth => {
          if (synth) synth.triggerRelease();
        });
        trimmedNotes.forEach((note, index) => {
          if (synthRefs.current[index]) {
            const noteOctave = noteOctaves[index] || octave;
            synthRefs.current[index]?.triggerAttack(`${note}${noteOctave}`);
          }
        });
      }
    }
  }, [selectedNotes, octave, isPlaying, noteOctaves]);

  const handleOctaveChange = useCallback((slotIndex: number, newOctave: number) => {
    setNoteOctaves(prevOctaves => {
      const newOctaves = [...prevOctaves];
      newOctaves[slotIndex] = newOctave;
      return newOctaves;
    });
    
    if (isPlaying && selectedNotes[slotIndex]) {
      // Stop and restart the specific note with new octave
      if (synthRefs.current[slotIndex]) {
        synthRefs.current[slotIndex]?.triggerRelease();
        synthRefs.current[slotIndex]?.triggerAttack(`${selectedNotes[slotIndex]}${newOctave}`);
      }
    }
  }, [isPlaying, selectedNotes]);

  const handleSoundTypeChange = useCallback((newSoundType: SoundType) => {
    setSoundType(newSoundType);
    if (isPlaying && selectedNotes.length > 0) {
      createSynth(newSoundType);
      
      // Start notes with new sound type
      selectedNotes.forEach((note, index) => {
        if (synthRefs.current[index]) {
          const noteOctave = noteOctaves[index] || octave;
          synthRefs.current[index]?.triggerAttack(`${note}${noteOctave}`);
        }
      });
    }
  }, [isPlaying, selectedNotes, noteOctaves, maxNotes, octave, createSynth]);

  const handleToggle = useCallback(async () => {
    await Tone.start();
    await Tone.context.resume();
    if (isPlaying) {
      handleStop();
    } else {
      try {
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return (
    <div 
      style={{
        padding: '2vw 1vw',
        border: '1px solid #ccc',
        borderRadius: 8,
        textAlign: 'center',
        overflow: 'visible',
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
      <h2 style={{ fontSize: '1.5rem', margin: '0 0 8px 0' }}>Drone</h2>
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
        height: '100%',
        fontSize: 'clamp(12px, 1.2vw, 16px)',
        padding: 'clamp(4px, 1vw, 16px)',
        boxSizing: 'border-box',
      }}>
        {/* Max notes buttons */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center',
          width: '100%',
          maxWidth: '280px'
        }}>
          {[1, 2, 3].map((num) => (
            <button
              key={num}
              onClick={(e) => {
                e.stopPropagation();
                handleMaxNotesChange(num);
              }}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                border: 'none',
                borderRadius: '0px',
                backgroundColor: maxNotes === num ? '#ff5722' : '#e8e8e8',
                color: maxNotes === num ? 'white' : '#333',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flex: 1,
                margin: '0px'
              }}
              aria-label={`Select ${num} note${num > 1 ? 's' : ''} maximum`}
            >
              {num} note{num > 1 ? 's' : ''}
            </button>
          ))}
        </div>

        {/* Note buttons */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, 1fr)', 
          width: '100%',
          maxWidth: '280px'
        }}>
          {NOTES.map((n) => (
            <button
              key={n}
              onClick={(e) => {
                e.stopPropagation();
                handleNoteChange(n);
              }}
              style={{
                padding: '12px 4px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '0px',
                backgroundColor: selectedNotes.includes(n) ? '#4caf50' : '#e8e8e8',
                color: selectedNotes.includes(n) ? 'white' : '#333',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minHeight: '48px',
                margin: '0px'
              }}
              aria-label={`Select note ${n}`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Octave buttons - single set for 1 note, multiple sets for 2-3 notes */}
        {maxNotes === 1 ? (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center',
            flexWrap: 'wrap',
            width: '100%',
            maxWidth: '280px'
          }}>
            {OCTAVES.map((o) => (
              <button
                key={o}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOctaveChange(0, o);
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  border: 'none',
                  borderRadius: '0px',
                  backgroundColor: noteOctaves[0] === o ? '#2196f3' : '#e8e8e8',
                  color: noteOctaves[0] === o ? 'white' : '#333',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: '40px',
                  margin: '0px',
                  flex: 1
                }}
                aria-label={`Select octave ${o}`}
              >
                {o}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: '8px',
              width: '100%',
              maxWidth: '280px'
            }}>
              {Array.from({ length: maxNotes }).map((_, slotIndex) => {
                const note = selectedNotes[slotIndex];
                return (
                  <div key={slotIndex} style={{ 
                    display: 'flex', 
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '12px', minWidth: '48px', textAlign: 'center' }}>
                      {note ? note : `--`}:
                    </span>
                    <div style={{ display: 'flex', flex: 1 }}>
                      {OCTAVES.map((o) => (
                        <button
                          key={o}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOctaveChange(slotIndex, o);
                          }}
                          style={{
                            padding: '6px 8px',
                            fontSize: '12px',
                            border: 'none',
                            borderRadius: '0px',
                            backgroundColor: noteOctaves[slotIndex] === o ? '#2196f3' : '#e8e8e8',
                            color: noteOctaves[slotIndex] === o ? 'white' : '#333',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            flex: 1,
                            margin: '0px'
                          }}
                          aria-label={`Select octave ${o} for slot ${slotIndex + 1}`}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Just intonation blurb for 2 or 3 notes */}
            {(maxNotes === 2 || maxNotes === 3) && (
              <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', marginTop: '4px', textAlign: 'center' }}>
                Just intonation coming soon, hopefully
              </div>
            )}
          </>
        )}

        <div style={{ fontSize: '18px', marginTop: '8px', textAlign: 'center' }}>
          {selectedNotes.length === 0 ? (
            '--'
          ) : selectedNotes.length === 1 ? (
            `${selectedNotes[0]}${noteOctaves[0] ?? octave}`
          ) : (
            `${selectedNotes.map((note, idx) => `${note}${noteOctaves[idx] ?? octave}`).join(', ')}`
          )}
        </div>

        {/* Sound type buttons */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center',
          width: '100%',
          maxWidth: '280px'
        }}>
          {[
            { type: 'tuning' as SoundType, label: 'tone 1', color: '#00bcd4' },
            { type: 'pure' as SoundType, label: 'tone 2', color: '#9c27b0' },
            { type: '"brass"' as SoundType, label: 'tone 3', color: '#795548' },
            { type: 'retro' as SoundType, label: 'tone 4', color: '#ff9800' }
          ].map(({ type, label, color }) => (
            <button
              key={type}
              onClick={(e) => {
                e.stopPropagation();
                handleSoundTypeChange(type);
              }}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                border: 'none',
                borderRadius: '0px',
                backgroundColor: soundType === type ? color : '#e8e8e8',
                color: soundType === type ? 'white' : '#333',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '50px',
                margin: '0px',
                flex: 1
              }}
              aria-label={`Select ${label} sound`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div style={{ color: 'red', fontSize: '14px', textAlign: 'center' }}>{error}</div>}
      </div>
    </div>
  );
};

export default Drone; 