import React, { useState, useRef, useEffect } from 'react';
import * as Tone from 'tone';

const COMMON_BPMS = [44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 138, 144, 152, 160, 168, 176, 184, 200, 208];

const MAIN_SOUNDS = [
  { label: 'Click 1', file: `${import.meta.env.BASE_URL}metronome_sounds/Perc_Chair_lo.wav` },
  { label: 'Click 2', file: `${import.meta.env.BASE_URL}metronome_sounds/Perc_MetronomeQuartz_lo.wav` },
  { label: 'Click 3', file: `${import.meta.env.BASE_URL}metronome_sounds/Synth_Bell_A_hi.wav` },
  { label: 'Click 4', file: `${import.meta.env.BASE_URL}metronome_sounds/Synth_Square_D_hi.wav` },
  { label: 'Click 5', file: `${import.meta.env.BASE_URL}metronome_sounds/Synth_Weird_A_hi.wav` },
];

function getDisplayName(file: string) {
  const base = file.split('/').pop()?.replace(/\.wav$/i, '') || file;
  const main = MAIN_SOUNDS.find(m => m.file === file);
  return main ? `${base} (${main.label})` : base;
}

const Metronome: React.FC = () => {
  const [bpm, setBpm] = useState(88);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundIdx, setSoundIdx] = useState(0); // index in allSounds
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allSounds, setAllSounds] = useState<string[]>(MAIN_SOUNDS.map(s => s.file));
  const playerRef = useRef<Tone.Player | null>(null);
  const loopRef = useRef<Tone.Loop | null>(null);

  // Load all sounds from index.json on mount
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}metronome_sounds/index.json`)
      .then(res => res.json())
      .then(files => setAllSounds(files.map((f: string) => `${import.meta.env.BASE_URL}metronome_sounds/` + f)))
      .catch(() => setAllSounds(MAIN_SOUNDS.map(s => s.file)));
    return () => {
      stopMetronome();
    };
    // eslint-disable-next-line
  }, []);

  // Cleanup audio on unmount or stop
  useEffect(() => {
    return () => {
      stopMetronome();
    };
    // eslint-disable-next-line
  }, []);

  // Helper: unlock Tone.js context on user gesture
  async function unlockAudioContext() {
    try {
      if (Tone.context.state !== 'running') {
        await Tone.start();
        await Tone.context.resume();
      }
      return true;
    } catch {
      setError('Audio could not be started. Try clicking again or refresh.');
      return false;
    }
  }

  // Helper: create and load Tone.Player
  async function loadPlayer(file: string) {
    setIsLoading(true);
    if (playerRef.current) {
      playerRef.current.dispose();
      playerRef.current = null;
    }
    return new Promise<Tone.Player>((resolve, reject) => {
      const player = new Tone.Player({
        url: file,
        autostart: false,
        volume: 12, // maximum loudness for normal computers (dB)
        onload: () => {
          setIsLoading(false);
          resolve(player);
        },
        onerror: (e) => {
          setIsLoading(false);
          setError('Failed to load sound.');
          reject(e);
        },
      }).toDestination();
    });
  }

  // Start metronome
  async function startMetronome() {
    setError(null);
    const ok = await unlockAudioContext();
    if (!ok) return;
    stopMetronome();
    try {
      const player = await loadPlayer(allSounds[soundIdx]);
      playerRef.current = player;
      Tone.Transport.bpm.value = bpm;
      loopRef.current = new Tone.Loop((time) => {
        if (playerRef.current && playerRef.current.loaded) {
          playerRef.current.start(time);
        }
      }, '4n');
      loopRef.current.start(0);
      Tone.Transport.start();
      setIsPlaying(true);
    } catch {
      setError('Could not start metronome.');
      setIsPlaying(false);
    }
  }

  // Stop metronome
  function stopMetronome() {
    setIsPlaying(false);
    if (loopRef.current) {
      try { loopRef.current.stop(0); } catch {}
      try { loopRef.current.dispose(); } catch {}
      loopRef.current = null;
    }
    if (playerRef.current) {
      try { playerRef.current.dispose(); } catch {}
      playerRef.current = null;
    }
    try { Tone.Transport.stop(); Tone.Transport.cancel(); } catch {}
  }

  // Toggle play/stop
  async function handleToggle() {
    if (isPlaying) {
      stopMetronome();
    } else {
      await startMetronome();
    }
  }

  // Change sound
  async function handleSoundChange(idx: number) {
    setSoundIdx(idx);
    if (isPlaying) {
      await switchSoundSeamlessly(idx);
    }
  }

  // Seamlessly switch sound while playing
  async function switchSoundSeamlessly(newSoundIdx: number) {
    try {
      // Load the new sound
      const newPlayer = await loadPlayer(allSounds[newSoundIdx]);
      
      // If we successfully loaded the new sound, update the reference
      if (playerRef.current) {
        // Dispose the old player
        playerRef.current.dispose();
      }
      
      // Set the new player as the current one
      playerRef.current = newPlayer;
    } catch (error) {
      setError('Failed to switch sound.');
      console.error('Sound switch error:', error);
    }
  }

  // Change BPM
  function handleBpmChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newBpm = Number(e.target.value);
    setBpm(newBpm);
    if (isPlaying) {
      Tone.Transport.bpm.value = newBpm;
    }
  }

  function handleBpmButtonClick(newBpm: number) {
    setBpm(newBpm);
    if (isPlaying) {
      Tone.Transport.bpm.value = newBpm;
    }
  }

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
              onClick={e => { e.stopPropagation(); handleBpmButtonClick(bpmValue); }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px' }}>
          <label>
            Custom:
            <input
              type="number"
              min={30}
              max={300}
              value={bpm}
              onChange={handleBpmChange}
              style={{ width: 60, marginLeft: 6, fontSize: '15px', padding: '3px 6px' }}
              onClick={e => e.stopPropagation()}
              aria-label="Set custom metronome BPM"
            />
          </label>
        </div>
        {/* Sound selection */}
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: 380, marginTop: 6 }}>
          {MAIN_SOUNDS.map((s) => {
            // Find the index in allSounds for this main sound
            const allIdx = allSounds.findIndex(f => f === s.file);
            return (
              <button
                key={s.file}
                onClick={e => { e.stopPropagation(); handleSoundChange(allIdx); }}
                style={{
                  padding: '5px 6px',
                  fontSize: '11px',
                  border: 'none',
                  borderRadius: '0px',
                  backgroundColor: soundIdx === allIdx ? '#4caf50' : '#e8e8e8',
                  color: soundIdx === allIdx ? 'white' : '#333',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: '38px',
                  margin: '0px',
                  flex: 1,
                }}
                aria-label={`Select ${s.label} click sound`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        {/* Dropdown for all sounds */}
        <div style={{ marginTop: 8, width: '100%', maxWidth: 420, display: 'flex', justifyContent: 'center' }}>
          <select
            value={soundIdx}
            onChange={e => {
              handleSoundChange(Number(e.target.value));
            }}
            style={{ fontSize: 13, padding: '3px 6px', width: '100%', maxWidth: 320 }}
            aria-label="Select metronome sound"
          >
            {allSounds.map((file, idx) => (
              <option key={file} value={idx}>
                {getDisplayName(file)}
              </option>
            ))}
          </select>
        </div>
        {/* Info blurb */}
        <div style={{ marginTop: 4, width: '100%', maxWidth: 320, fontSize: 10, color: '#888', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.4 }}>
          metronome sounds recorded by Ludwig Peter Müller<br />
          for use under Creative Commons CC0 1.0 Universal
        </div>
        {isLoading && <div style={{ color: '#888', fontSize: 13, marginTop: 8 }}>Loading sound...</div>}
        {error && <div style={{ color: 'red', fontSize: '14px', textAlign: 'center' }}>{error}</div>}
      </div>
    </div>
  );
};

export default Metronome; 