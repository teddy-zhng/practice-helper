import React, { useState, useRef, useCallback } from 'react';
import { PitchDetector } from 'pitchy';

const BUFFER_SIZE = 2048;
const detectPitch = PitchDetector.forFloat32Array(BUFFER_SIZE);

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Define proper types for AudioContext
interface AudioContextType {
  new (): AudioContext;
}

interface WebkitAudioContextType {
  new (): AudioContext;
}

declare global {
  interface Window {
    webkitAudioContext?: WebkitAudioContextType;
  }
}

function getNoteName(frequency: number) {
  const A4 = 440;
  const semitones = 12 * Math.log2(frequency / A4);
  const noteIndex = Math.round(semitones) + 57; // 57 = A4 index
  const noteName = NOTE_NAMES[(noteIndex + 12 * 1000) % 12];
  const octave = Math.floor((noteIndex) / 12);
  return `${noteName}${octave}`;
}

function getCents(frequency: number, noteFreq: number) {
  return Math.floor(1200 * Math.log2(frequency / noteFreq));
}

interface TunerProps {
  note: string | null;
  cents: number | null;
  setNote: (note: string | null) => void;
  setCents: (cents: number | null) => void;
}

const Tuner: React.FC<TunerProps> = ({ note, cents, setNote, setCents }) => {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setIsListening(false);
    setNote(null);
    setCents(null);
  }, [setNote, setCents]);

  // Resume audio context on tab visibility change
  React.useEffect(() => {
    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === 'visible' &&
        audioContextRef.current &&
        audioContextRef.current.state !== 'running'
      ) {
        await audioContextRef.current.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const listen = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioContextClass = (window.AudioContext || window.webkitAudioContext) as AudioContextType;
      // Always create a new AudioContext
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      if (audioContext.state !== 'running') {
        await audioContext.resume();
      }
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = BUFFER_SIZE;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      let lastUpdate = 0;
      const minRMS = 0.01; // Minimum RMS amplitude to consider (ignore quiet input)
      const clarityThreshold = 0.8; // Increased clarity threshold
      const updateInterval = 16; // ms
      const detect = (now?: number) => {
        analyser.getFloatTimeDomainData(buffer);
        // Calculate RMS amplitude
        let rms = 0;
        for (let i = 0; i < buffer.length; i++) {
          rms += buffer[i] * buffer[i];
        }
        rms = Math.sqrt(rms / buffer.length);
        // Throttle updates
        const time = now !== undefined ? now : performance.now();
        if (rms > minRMS && time - lastUpdate > updateInterval) {
          const [pitch, clarity] = detectPitch.findPitch(buffer, audioContext.sampleRate);
          if (clarity > clarityThreshold && pitch > 50 && pitch < 2000) {
            const noteName = getNoteName(pitch);
            // Calculate the frequency of the detected note
            const noteIndex = Math.round(12 * Math.log2(pitch / 440) + 57);
            const noteFreq = 440 * Math.pow(2, (noteIndex - 57) / 12);
            setNote(noteName);
            setCents(getCents(pitch, noteFreq));
          } else {
            setNote(null);
            setCents(null);
          }
          lastUpdate = time;
        }
        rafRef.current = requestAnimationFrame(detect);
      };
      detect();
    } catch {
      setError('oops! something went wrong! you may need to refresh the website');
      setIsListening(false);
      // Start auto-retry
      if (!retryTimeoutRef.current) {
        retryTimeoutRef.current = window.setTimeout(() => {
          retryTimeoutRef.current = null;
          if (!isListening) return; // Only retry if still enabled
          listen();
        }, 2000);
      }
    }
  };

  const handleToggle = async () => {
    if (isListening) {
      stop();
    } else {
      try {
        if (audioContextRef.current && audioContextRef.current.state !== 'running') {
          await audioContextRef.current.resume();
        }
        setIsListening(true);
        listen();
      } catch {
        setError('oops! something went wrong! you may need to refresh the website');
        // Start auto-retry
        if (!retryTimeoutRef.current) {
          retryTimeoutRef.current = window.setTimeout(() => {
            retryTimeoutRef.current = null;
            if (!isListening) return;
            listen();
          }, 2000);
        }
      }
    }
  };

  React.useEffect(() => {
    return () => stop();
  }, [stop]);

  // Just intonation labels
  const justIntonationLabels: { [cents: number]: string } = {
    [+12]: 'm2 (+12)', 
    [+4]: 'M2 (+4)',
    [+16]: 'm3 (+16)',
    [-14]: 'M3 (-14)',
    [-2]: 'P4 (-2)',
    [-18]: 'tritone (-18)',
    [+2]: 'P5 (+2)',
    [+14]: 'm6 (+14)',
    [-16]: 'M6 (-16)',
    [-4]: 'm7 (-4)',
    [-12]: 'M7 (-12)',
  };

  return (
    <div 
      style={{
        padding: '2vw 1vw',
        border: '1px solid #ccc',
        borderRadius: 8,
        textAlign: 'center',
        overflow: 'visible',
        cursor: 'pointer',
        backgroundColor: isListening ? '#f0f8ff' : '#fff',
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
      <h2 style={{ fontSize: '1.5rem', margin: '0 0 8px 0' }}>Tuner</h2>
      <div style={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 'clamp(2px, 0.5vh, 8px)',
        width: '100%',
        maxWidth: 420,
        minWidth: 220,
        height: '100%',
      }}>
        <svg 
          width="100%"
          height="100%"
          viewBox="0 0 320 460"
          style={{
            display: 'block',
            margin: '0 auto',
            overflow: 'visible',
            flexGrow: 1,
            maxHeight: '60vh',
            minHeight: 180,
            width: '100%',
          }}
        >
          {/* Vertical scale */}
          <line
            x1="160"
            y1="20"
            x2="160"
            y2="420"
            stroke="#bbb"
            strokeWidth={1}
            strokeLinecap="round"
          />
          {/* Ticks: every cent from -25 to 25 */}
          {Array.from({ length: 51 }, (_, i) => {
            const cents = i - 25;
            const label = justIntonationLabels[cents];
            const isJustLabel = label !== undefined;
            const isEndTick = cents === 0 || cents === -25 || cents === 25;
            const tickLen = isEndTick ? 40 : isJustLabel ? 24 : 12;
            const tickColor = isEndTick ? '#111' : isJustLabel ? '#444' : '#888';
            const y = 420 - ((cents + 25) / 50) * 400;
            const isMinorLabel = label && (label.includes('m') || label.includes('tritone'));
            
            return (
              <g key={cents}>
                <line
                  x1={160 - tickLen}
                  y1={y}
                  x2={160 + tickLen}
                  y2={y}
                  stroke={tickColor}
                  strokeWidth={isEndTick ? 3 : isJustLabel ? 2 : 1}
                />
                {isJustLabel && isMinorLabel && (
                  <text
                    x={160 - tickLen - 12}
                    y={y}
                    fontSize={13}
                    fill="#333"
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {label}
                  </text>
                )}
                {isJustLabel && !isMinorLabel && (
                  <text
                    x={160 + tickLen + 12}
                    y={y}
                    fontSize={13}
                    fill="#333"
                    textAnchor="start"
                    dominantBaseline="middle"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
          {/* -25 and +25 labels */}
          <text
            x="160"
            y="432"
            fontSize={13}
            fill="#333"
            textAnchor="middle"
            dominantBaseline="hanging"
          >
            -25
          </text>
          <text
            x="160"
            y="8"
            fontSize={13}
            fill="#333"
            textAnchor="middle"
            dominantBaseline="auto"
          >
            +25
          </text>
          {/* Indicator */}
          {cents !== null && (
            <circle
              cx="160"
              cy={420 - ((Math.max(-25, Math.min(25, cents)) + 25) / 50) * 400}
              r={8}
              fill={cents >= -25 && cents <= 25 ? '#32CD32' : '#e74c3c'}
            />
          )}
        </svg>
        <div style={{ fontSize: 24, marginTop: 8 }}>{note || '--'}</div>
        <div style={{ fontSize: 16, color: '#888' }}>cents: {cents !== null ? cents : '--'}</div>
        {error && <div style={{ color: 'red' }}>{error}</div>}
      </div>
    </div>
  );
};
export default Tuner; 