import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVES = [2, 3, 4, 5, 6];

const JUST_INTONATION_RATIOS = [
  1 / 1,      // Unison
  16 / 15,    // Minor Second
  9 / 8,      // Major Second
  6 / 5,      // Minor Third
  5 / 4,      // Major Third
  4 / 3,      // Perfect Fourth
  45 / 32,    // Tritone
  3 / 2,      // Perfect Fifth
  8 / 5,      // Minor Sixth
  5 / 3,      // Major Sixth
  16 / 9,     // Minor Seventh
  15 / 8,     // Major Seventh
];

const INTERVAL_ABBREVIATIONS = [
  'Root', 'm2', 'M2', 'm3', 'M3', 'P4',
  'TT', 'P5', 'm6', 'M6', 'm7', 'M7'
];

type SoundType = 'pure' | 'retro';

interface DisplayInfo {
  note: string;
  octave: number;
  freq: number;
  isRoot?: boolean;
  intervalName?: string;
  cents?: number;
}

const Drone: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [noteOctaves, setNoteOctaves] = useState<number[]>([4]);
  const [maxNotes, setMaxNotes] = useState(1);
  const [octave] = useState(4);
  const [soundType, setSoundType] = useState<SoundType>('pure');
  const [a4Frequency, setA4Frequency] = useState(440);
  const [justIntonation, setJustIntonation] = useState(true);
  const [displayInfo, setDisplayInfo] = useState<DisplayInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const synthRefs = useRef<(Tone.Synth | Tone.MonoSynth | null)[]>([]);

  const getFrequency = useCallback((note: string, octave: number): number => {
    const midi = Tone.Frequency(`${note}${octave}`).toMidi();
    return a4Frequency * Math.pow(2, (midi - 69) / 12);
  }, [a4Frequency]);

  const createSynth = useCallback((type: SoundType) => {
    synthRefs.current.forEach(synth => synth?.dispose());
    synthRefs.current = [];
    for (let i = 0; i < maxNotes; i++) {
      let synth;
      switch (type) {
        case 'retro':
          synth = new Tone.Synth({ oscillator: { type: 'square' } }).toDestination();
          break;
        default: // pure
          synth = new Tone.Synth().toDestination();
          break;
      }
      synthRefs.current.push(synth);
    }
  }, [maxNotes]);

  const stop = useCallback(() => {
    synthRefs.current.forEach(synth => {
        synth?.dispose();
    });
    synthRefs.current = [];
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && Tone.context.state !== 'running') {
        await Tone.context.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Add a one-time event listener to start audio on the first user gesture
    const startAudioContext = async () => {
      if (Tone.context.state !== 'running') {
        await Tone.start();
      }
    };
    document.documentElement.addEventListener('mousedown', startAudioContext, { once: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.documentElement.removeEventListener('mousedown', startAudioContext);
    };
  }, []);

  // Effect for updating the display
  useEffect(() => {
    if (selectedNotes.length === 0) {
      setDisplayInfo([]);
      return;
    }

    const equalTempFreqs = selectedNotes.map((note, index) => getFrequency(note, noteOctaves[index] || octave));
    const newDisplayInfo: DisplayInfo[] = [];

    selectedNotes.forEach((note, index) => {
        const noteOctave = noteOctaves[index] || octave;
        const currentFreq = equalTempFreqs[index];

        const displayData: DisplayInfo = {
            note: note,
            octave: noteOctave,
            freq: currentFreq,
        };

        if (selectedNotes.length > 1) {
            if (index === 0) {
                displayData.isRoot = true;
            } else {
                const rootMidi = Tone.Frequency(`${selectedNotes[0]}${noteOctaves[0] || octave}`).toMidi();
                const currentMidi = Tone.Frequency(`${note}${noteOctave}`).toMidi();
                let interval = (currentMidi - rootMidi) % 12;
                if (interval < 0) interval += 12;
                
                displayData.intervalName = INTERVAL_ABBREVIATIONS[interval];

                if (justIntonation) {
                    const rootFreq = equalTempFreqs[0];
                    const ratio = JUST_INTONATION_RATIOS[interval];
                    const octaveDiff = Math.floor((currentMidi - rootMidi) / 12);
                    const justFreq = rootFreq * ratio * Math.pow(2, octaveDiff);
                    
                    displayData.freq = justFreq;
                    displayData.cents = 1200 * Math.log2(justFreq / currentFreq);
                }
            }
        }
        newDisplayInfo.push(displayData);
    });
    
    setDisplayInfo(newDisplayInfo);
  }, [selectedNotes, noteOctaves, a4Frequency, justIntonation, getFrequency, octave]);

  // Effect for handling audio playback
  useEffect(() => {
    if (!isPlaying) {
      stop();
      return;
    }

    let isCancelled = false;

    const startAudio = async () => {
      try {
        if (Tone.context.state !== 'running') {
          await Tone.start();
          await Tone.context.resume();
        }
        if (isCancelled) return;

        createSynth(soundType);

        const equalTempFreqs = selectedNotes.map((note, index) => getFrequency(note, noteOctaves[index] || octave));
        let freqsToPlay = [...equalTempFreqs];

        if (justIntonation && selectedNotes.length > 1 && selectedNotes.length < 4) {
          const rootFreq = equalTempFreqs[0];
          const rootMidi = Tone.Frequency(`${selectedNotes[0]}${noteOctaves[0] || octave}`).toMidi();

          for (let i = 1; i < selectedNotes.length; i++) {
            const nextMidi = Tone.Frequency(`${selectedNotes[i]}${noteOctaves[i] || octave}`).toMidi();
            let interval = (nextMidi - rootMidi) % 12;
            if (interval < 0) interval += 12;

            const ratio = JUST_INTONATION_RATIOS[interval];
            const octaveDiff = Math.floor((nextMidi - rootMidi) / 12);
            freqsToPlay[i] = rootFreq * ratio * Math.pow(2, octaveDiff);
          }
        }

        const now = Tone.now();
        freqsToPlay.forEach((freq, index) => {
          if (synthRefs.current[index]) {
            const startTime = now + (index * 0.01); // Stagger start times by 10ms
            synthRefs.current[index].triggerAttack(freq, startTime);
          }
        });

      } catch (e) {
        setError('Oops! Something went wrong. You may need to refresh the page.');
        setIsPlaying(false);
      }
    };

    startAudio();

    return () => {
      isCancelled = true;
      stop();
    };
  }, [isPlaying, selectedNotes, noteOctaves, a4Frequency, justIntonation, soundType, maxNotes, createSynth, getFrequency, octave, stop]);

  const handleToggle = useCallback(async () => {
    setError(null);
    if (Tone.context.state !== 'running') {
      try {
        await Tone.start();
        await Tone.context.resume();
      } catch (e) {
        setError('Could not start audio. Please interact with the page first.');
        return;
      }
    }
    setIsPlaying(prev => !prev);
  }, []);

  const handleNoteChange = useCallback((newNote: string) => {
    if (selectedNotes.includes(newNote)) {
        // Remove ALL instances of this note (strict sync)
        const indicesToRemove = selectedNotes.map((n, i) => n === newNote ? i : -1).filter(i => i !== -1);
        const newNotes = selectedNotes.filter((_, i) => !indicesToRemove.includes(i));
        const newOctaves = noteOctaves.filter((_, i) => !indicesToRemove.includes(i));
        
        setSelectedNotes(newNotes);
        setNoteOctaves(newOctaves);
    } else if (selectedNotes.length < maxNotes) {
        // Add new note
        const nextIndex = selectedNotes.length;
        setSelectedNotes([...selectedNotes, newNote]);
        const newOctaves = [...noteOctaves];
        if (newOctaves[nextIndex] === undefined) {
            newOctaves[nextIndex] = octave;
        }
        setNoteOctaves(newOctaves);
    } else {
        // Replace oldest
        const newNotes = [...selectedNotes.slice(1), newNote];
        const newOctaves = [...noteOctaves.slice(1), octave];
        setSelectedNotes(newNotes);
        setNoteOctaves(newOctaves);
    }
  }, [selectedNotes, noteOctaves, maxNotes, octave]);

  const handleOctaveAdd = useCallback((note: string, currentOctave: number, direction: 'up' | 'down') => {
    if (!note) return;
    
    // Calculate target octave based on direction
    let targetOctave = direction === 'up' ? currentOctave + 1 : currentOctave - 1;
    
    // Boundary checks: 
    // If going up from 6 (to 7), go down instead (to 5).
    // If going down from 2 (to 1), go up instead (to 3).
    if (targetOctave > 6) targetOctave = currentOctave - 1;
    if (targetOctave < 2) targetOctave = currentOctave + 1;
    
    // Check for existing instance of this note+octave
    const idx = selectedNotes.findIndex((n, i) => n === note && noteOctaves[i] === targetOctave);
    
    if (idx !== -1) {
        // Already exists: Do nothing (prevent unison). 
        // User must use the 'X' button on the duplicate note to remove it.
        return;
    } else if (selectedNotes.length < maxNotes) {
        // Add new note normally
        const nextIndex = selectedNotes.length;
        setSelectedNotes([...selectedNotes, note]);
        const newOctaves = [...noteOctaves];
        newOctaves[nextIndex] = targetOctave;
        setNoteOctaves(newOctaves);
    } else {
        // Queue full -> Shift
        // If the note we are interacting with is the Root (index 0), we preserve it.
        // Otherwise, we follow standard FIFO (remove index 0).
        const originalIndex = selectedNotes.findIndex((n, i) => n === note && noteOctaves[i] === currentOctave);
        
        let removeIndex = 0; 
        if (originalIndex === 0) {
            removeIndex = 1; 
        }
        
        const newNotes = selectedNotes.filter((_, i) => i !== removeIndex);
        const newOctaves = noteOctaves.filter((_, i) => i !== removeIndex);
        
        setSelectedNotes([...newNotes, note]);
        setNoteOctaves([...newOctaves, targetOctave]);
    }
  }, [selectedNotes, noteOctaves, maxNotes]);

  const handleMaxNotesChange = useCallback((newMaxNotes: number) => {
    setMaxNotes(newMaxNotes);
    setSelectedNotes(prev => prev.slice(0, newMaxNotes));
    setNoteOctaves(prev => {
      const newOctaves = prev.slice(0, newMaxNotes);
      while (newOctaves.length < newMaxNotes) {
        newOctaves.push(octave);
      }
      return newOctaves;
    });
  }, [octave]);

  const handleOctaveChange = useCallback((slotIndex: number, newOctave: number) => {
    setNoteOctaves(prev => {
        const newOctaves = [...prev];
        newOctaves[slotIndex] = newOctave;
        return newOctaves;
    });
  }, []);

  const handleNoteRemove = useCallback((index: number) => {
    const newNotes = selectedNotes.filter((_, i) => i !== index);
    const newOctaves = noteOctaves.filter((_, i) => i !== index);
    setSelectedNotes(newNotes);
    setNoteOctaves(newOctaves);
  }, [selectedNotes, noteOctaves]);

  const handleSoundTypeChange = useCallback((newSoundType: SoundType) => {
    setSoundType(newSoundType);
  }, []);

  useEffect(() => {
    return () => {
      synthRefs.current.forEach(synth => synth?.dispose());
    };
  }, []);

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
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center',
          width: '100%',
          maxWidth: '280px'
        }}>
          {[1, 2, 3].map((num) => (
            <button
              key={num}
              onClick={(e) => { e.stopPropagation(); handleMaxNotesChange(num); }}
              style={{
                padding: '6px 12px', fontSize: '12px', border: 'none', borderRadius: '0px',
                backgroundColor: maxNotes === num ? '#ff5722' : '#e8e8e8',
                color: maxNotes === num ? 'white' : '#333',
                cursor: 'pointer', transition: 'all 0.2s ease', flex: 1, margin: '0px'
              }}
              aria-label={`Select ${num} note${num > 1 ? 's' : ''} maximum`}
            >
              {num} note{num > 1 ? 's' : ''}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', maxWidth: '280px' }}>
          <label htmlFor="a4-freq" style={{ fontSize: '14px' }}>A4 =</label>
          <input
            id="a4-freq"
            type="number"
            value={a4Frequency}
            onChange={(e) => { const newFreq = parseFloat(e.target.value); if (!isNaN(newFreq) && newFreq > 0) setA4Frequency(newFreq); }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '80px', padding: '4px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '14px' }}>Hz</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', width: '100%', maxWidth: '280px' }}>
          {NOTES.map((n) => (
            <button
              key={n}
              onClick={(e) => { e.stopPropagation(); handleNoteChange(n); }}
              style={{
                padding: '12px 4px', fontSize: '14px', border: 'none', borderRadius: '0px',
                backgroundColor: selectedNotes.includes(n) ? '#4caf50' : '#e8e8e8',
                color: selectedNotes.includes(n) ? 'white' : '#333',
                cursor: 'pointer', transition: 'all 0.2s ease', minHeight: '48px', margin: '0px'
              }}
              aria-label={`Select note ${n}`}
            >
              {n}
            </button>
          ))}
        </div>

        {maxNotes === 1 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', width: '100%', maxWidth: '280px' }}>
            <span style={{ fontSize: '12px', minWidth: '48px', textAlign: 'center' }}>
              {selectedNotes[0] ? selectedNotes[0] : `--`}:
            </span>
            <div style={{ display: 'flex', flex: 1 }}>
              {OCTAVES.map((o) => (
                <button
                  key={o}
                  onClick={(e) => { e.stopPropagation(); handleOctaveChange(0, o); }}
                  style={{
                    padding: '6px 4px', fontSize: '12px', border: 'none', borderRadius: '0px',
                    backgroundColor: noteOctaves[0] === o ? '#2196f3' : '#e8e8e8',
                    color: noteOctaves[0] === o ? 'white' : '#333',
                    cursor: 'pointer', transition: 'all 0.2s ease', flex: 1, margin: '0px'
                  }}
                  aria-label={`Select octave ${o}`}
                >
                  {o}
                </button>
              ))}
            </div>
            <div style={{ width: '32px', marginLeft: '4px' }} />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '280px' }}>
              {Array.from({ length: maxNotes }).map((_, slotIndex) => {
                const currentNote = selectedNotes[slotIndex];
                const currentOctave = noteOctaves[slotIndex];
                return (
                <div key={slotIndex} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', minWidth: '48px', textAlign: 'center' }}>
                    {currentNote ? currentNote : `--`}:
                  </span>
                  <div style={{ display: 'flex', flex: 1 }}>
                    {OCTAVES.map((o) => {
                      // Disabled if this octave is selected for this note in ANY OTHER slot
                      let disabled = false;
                      if (currentNote) {
                          disabled = selectedNotes.some((otherNote, otherIndex) => 
                              otherIndex !== slotIndex && 
                              otherNote === currentNote && 
                              noteOctaves[otherIndex] === o
                          );
                      }
                      
                      return (
                      <button
                        key={o}
                        onClick={(e) => { e.stopPropagation(); if(!disabled) handleOctaveChange(slotIndex, o); }}
                        disabled={disabled}
                        style={{
                          padding: '6px 4px', fontSize: '12px', border: 'none', borderRadius: '0px',
                          backgroundColor: noteOctaves[slotIndex] === o ? '#2196f3' : (disabled ? '#ddd' : '#e8e8e8'),
                          color: noteOctaves[slotIndex] === o ? 'white' : (disabled ? '#aaa' : '#333'),
                          cursor: disabled ? 'default' : 'pointer', transition: 'all 0.2s ease', flex: 1, margin: '0px'
                        }}
                        aria-label={`Select octave ${o} for slot ${slotIndex + 1}`}
                      >
                        {o}
                      </button>
                    )})}
                  </div>
                  {/* 8va / 8vb buttons OR X button for duplicates */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginLeft: '4px', width: '32px', height: '100%', justifyContent: 'center' }}>
                    {currentNote && (
                        selectedNotes.indexOf(currentNote) === slotIndex ? (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleOctaveAdd(currentNote, currentOctave, 'up'); }}
                                    style={{
                                        padding: '2px 0', fontSize: '10px', border: 'none', borderRadius: '2px',
                                        backgroundColor: '#607d8b', color: 'white',
                                        cursor: 'pointer', lineHeight: 1, width: '100%'
                                    }}
                                    title="Add octave up"
                                >
                                    8va
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleOctaveAdd(currentNote, currentOctave, 'down'); }}
                                    style={{
                                        padding: '2px 0', fontSize: '10px', border: 'none', borderRadius: '2px',
                                        backgroundColor: '#607d8b', color: 'white',
                                        cursor: 'pointer', lineHeight: 1, width: '100%'
                                    }}
                                    title="Add octave down"
                                >
                                    8vb
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleNoteRemove(slotIndex); }}
                                style={{
                                    padding: '0', fontSize: '12px', border: 'none', borderRadius: '2px',
                                    backgroundColor: '#f44336', color: 'white',
                                    cursor: 'pointer', lineHeight: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%'
                                }}
                                title="Remove duplicate note"
                            >
                                ✕
                            </button>
                        )
                    )}
                  </div>
                </div>
              )})}
            </div>
            {(maxNotes === 2 || maxNotes === 3) && (
              <div 
                onClick={(e) => { e.stopPropagation(); setJustIntonation(p => !p); }}
                style={{ 
                  fontSize: '12px', color: justIntonation ? 'white' : '#555', 
                  backgroundColor: justIntonation ? '#673ab7' : '#e8e8e8',
                  fontStyle: 'italic', marginTop: '4px', textAlign: 'center', 
                  padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', 
                  width: '100%', maxWidth: '280px', boxSizing: 'border-box'
                }}
              >
                Just Intonation {justIntonation ? 'On' : 'Off'}
              </div>
            )}
          </>
        )}

        <div style={{ fontSize: '18px', marginTop: '8px', textAlign: 'center', lineHeight: '1.5' }}>
            {displayInfo.length === 0 ? '--' : (
                displayInfo.map((info, index) => (
                    <div key={index}>
                        <span>{`${info.note}${info.octave}`}</span>
                        <span style={{ fontSize: '12px', color: '#555', marginLeft: '8px' }}>
                            {`(${info.freq.toFixed(2)} Hz`}
                            {info.isRoot && ' root'}
                            {info.intervalName && `, ${info.intervalName}`}
                            {info.cents !== undefined && `, ${info.cents > 0 ? '+' : ''}${info.cents.toFixed(1)} cents`}
                            {`)`}
                        </span>
                    </div>
                ))
            )}
        </div>

        <div style={{ 
          display: 'flex', 
          justifyContent: 'center',
          width: '100%',
          maxWidth: '280px'
        }}>
          {[{
            type: 'pure' as SoundType, label: 'tone 1', color: '#9c27b0' },
            { type: 'retro' as SoundType, label: 'tone 2', color: '#ff9800' }
          ].map(({ type, label, color }) => (
            <button
              key={type}
              onClick={(e) => { e.stopPropagation(); handleSoundTypeChange(type); }}
              style={{
                padding: '6px 10px', fontSize: '12px', border: 'none', borderRadius: '0px',
                backgroundColor: soundType === type ? color : '#e8e8e8',
                color: soundType === type ? 'white' : '#333',
                cursor: 'pointer', transition: 'all 0.2s ease', minWidth: '50px', margin: '0px', flex: 1
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