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
        await Tone.start();
        await Tone.context.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
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
    setSelectedNotes(prevNotes => {
      if (prevNotes.includes(newNote)) {
        return prevNotes.filter(n => n !== newNote);
      } else if (prevNotes.length < maxNotes) {
        return [...prevNotes, newNote];
      } else {
        return [...prevNotes.slice(1), newNote];
      }
    });
  }, [maxNotes]);

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
          <>
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', width: '100%', maxWidth: '280px' }}>
              {OCTAVES.map((o) => (
                <button
                  key={o}
                  onClick={(e) => { e.stopPropagation(); handleOctaveChange(0, o); }}
                  style={{
                    padding: '8px 12px', fontSize: '14px', border: 'none', borderRadius: '0px',
                    backgroundColor: noteOctaves[0] === o ? '#2196f3' : '#e8e8e8',
                    color: noteOctaves[0] === o ? 'white' : '#333',
                    cursor: 'pointer', transition: 'all 0.2s ease', minWidth: '40px', margin: '0px', flex: 1
                  }}
                  aria-label={`Select octave ${o}`}
                >
                  {o}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '280px' }}>
              {Array.from({ length: maxNotes }).map((_, slotIndex) => (
                <div key={slotIndex} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', minWidth: '48px', textAlign: 'center' }}>
                    {selectedNotes[slotIndex] ? selectedNotes[slotIndex] : `--`}:
                  </span>
                  <div style={{ display: 'flex', flex: 1 }}>
                    {OCTAVES.map((o) => (
                      <button
                        key={o}
                        onClick={(e) => { e.stopPropagation(); handleOctaveChange(slotIndex, o); }}
                        style={{
                          padding: '6px 8px', fontSize: '12px', border: 'none', borderRadius: '0px',
                          backgroundColor: noteOctaves[slotIndex] === o ? '#2196f3' : '#e8e8e8',
                          color: noteOctaves[slotIndex] === o ? 'white' : '#333',
                          cursor: 'pointer', transition: 'all 0.2s ease', flex: 1, margin: '0px'
                        }}
                        aria-label={`Select octave ${o} for slot ${slotIndex + 1}`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
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