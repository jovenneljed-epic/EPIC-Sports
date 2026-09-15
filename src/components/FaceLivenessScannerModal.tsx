import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CheckCircle2, X, Eye, ScanFace, RefreshCw, UserCheck } from 'lucide-react';
import { faceEngine, type RosterVector, type ScanResult } from '../faceRecognition';
import { arenaAudio } from '../audioEngine';

interface FaceLivenessScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayerVerified: (playerId: string) => void;
  roster: RosterVector[];
}

export const FaceLivenessScannerModal: React.FC<FaceLivenessScannerModalProps> = ({
  isOpen,
  onClose,
  onPlayerVerified,
  roster,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasBlinked, setHasBlinked] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing Anti-Spoofing Camera...');
  const [debugDistance, setDebugDistance] = useState<string | null>(null);
  const [liveEAR, setLiveEAR] = useState<number | null>(null);
  const [successPlayer, setSuccessPlayer] = useState<{ name: string; jersey: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const onPlayerVerifiedRef = useRef(onPlayerVerified);
  onPlayerVerifiedRef.current = onPlayerVerified;

  const rosterRef = useRef(roster);
  rosterRef.current = roster;

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    let isScanning = true;let scanTimeout: number | null = null;
let resetTimeout: number | null = null;
    let blinkedFlag = false;
    let pausedForCelebration = false;

    setHasBlinked(false);
    setSuccessPlayer(null);
    setDebugDistance(null);
    setLiveEAR(null);
    setIsLoading(true);
    setStatusMessage('Loading biometric models and indexing roster...');
    faceEngine.resetLivenessBaseline();

    async function initializeScanner() {
      try {
        await faceEngine.loadModels();
        faceEngine.initializeMatcher(rosterRef.current);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });

        if (!isScanning) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setIsLoading(false);
        setStatusMessage('Look directly at the camera and BLINK to verify liveness.');

        const scanLoop = async () => {
          if (!videoRef.current || !isScanning) return;

          if (pausedForCelebration) {
            scanTimeout = setTimeout(scanLoop, 200);
            return;
          }

          try {
            const result: ScanResult = await faceEngine.scanLiveFrame(videoRef.current, blinkedFlag);

            if (result.currentEAR > 0) {
              setLiveEAR(result.currentEAR);
            }

            // Register blink
            if (result.isBlinking && !blinkedFlag) {
              blinkedFlag = true;
              setHasBlinked(true);
              setStatusMessage('Blink confirmed! Comparing with team roster...');
            }

            if (result.debugInfo) {
              setDebugDistance(result.debugInfo);
            }

            // Identity matched after blink
            if (blinkedFlag && result.matchedId) {
              const matched = rosterRef.current.find(
                (p) => String(p.id).trim() === String(result.matchedId).trim()
              );

              if (matched) {
                pausedForCelebration = true;
                arenaAudio.playWhistle();

                setSuccessPlayer({ name: matched.name, jersey: matched.jersey });
                setStatusMessage(`Verified: ${matched.name} (#${matched.jersey})`);

                onPlayerVerifiedRef.current(matched.id);

                resetTimeout = setTimeout(() => {
                  blinkedFlag = false;
                  setHasBlinked(false);
                  setSuccessPlayer(null);
                  setDebugDistance(null);
                  faceEngine.resetLivenessBaseline();
                  setStatusMessage('Ready for next player! Look into the camera and BLINK.');
                  pausedForCelebration = false;
                }, 2200);
              }
            }
          } catch (err) {
            console.warn('Frame scan tick error:', err);
          }

          if (isScanning) {
            scanTimeout = setTimeout(scanLoop, 90); // 90ms loop to catch rapid blinks
          }
        };

        scanLoop();
      } catch (err) {
        console.error('Scanner init error:', err);
        if (isScanning) {
          setIsLoading(false);
          setStatusMessage('Camera access failed or no valid roster vectors available.');
        }
      }
    }

    initializeScanner();

    return () => {
      isScanning = false;
      if (scanTimeout) clearTimeout(scanTimeout);
      if (resetTimeout) clearTimeout(resetTimeout);
      stopCamera();
    };
  }, [isOpen, handleClose, stopCamera]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-amber-400" /> Biometric Anti-Spoofing Desk
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white cursor-pointer transition p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Viewport */}
        <div
          className={`relative aspect-4/3 w-full bg-slate-950 rounded-2xl overflow-hidden border-2 transition-all duration-300 flex items-center justify-center ${
            successPlayer ? 'border-emerald-500 shadow-2xl shadow-emerald-500/20' : 'border-slate-800'
          }`}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover transform scale-x-[-1]"
          />

          {isLoading && (
            <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center gap-2 z-10">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-xs text-slate-300 font-semibold">Starting Biometric Engine...</p>
            </div>
          )}

          {/* Green Confirmation Overlay */}
          {successPlayer && (
            <div className="absolute inset-0 bg-emerald-950/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 space-y-3 z-30 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-400 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-900/80 px-3 py-0.5 rounded-full border border-emerald-500/50">
                  Facial Recognition Verified
                </span>
                <h2 className="text-2xl font-black text-white mt-2">{successPlayer.name}</h2>
                <p className="text-sm font-mono font-bold text-emerald-400">Jersey #{successPlayer.jersey}</p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-200 bg-emerald-900/60 px-3 py-1.5 rounded-lg border border-emerald-700/50 font-semibold">
                <UserCheck className="w-4 h-4 text-emerald-400" /> Attendance Confirmed • Desk Unlocked
              </div>
            </div>
          )}

          {/* Target Reticle */}
          {!successPlayer && (
            <div className="absolute inset-0 border-2 border-dashed border-amber-400/40 m-8 rounded-3xl pointer-events-none flex items-center justify-center">
              <div className="w-full h-0.5 bg-amber-400/20 animate-pulse" />
            </div>
          )}

          {/* Blink Badge */}
          {!successPlayer && (
            <div className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700 flex items-center gap-1.5 text-[11px] font-bold">
              <Eye className={`w-3.5 h-3.5 ${hasBlinked ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`} />
              <span className={hasBlinked ? 'text-emerald-400' : 'text-slate-300'}>
                {hasBlinked ? 'Blink Verified' : 'Waiting for Blink'}
              </span>
              {liveEAR !== null && (
                <span className="text-[10px] font-mono text-slate-400 ml-1 border-l border-slate-700 pl-1.5">
                  EAR: {liveEAR.toFixed(2)}
                </span>
              )}
            </div>
          )}

          {/* Distance Debug Info */}
          {debugDistance && !successPlayer && (
            <div className="absolute bottom-3 right-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-0.5 rounded text-[10px] font-mono text-slate-300 border border-slate-800 pointer-events-none">
              {debugDistance}
            </div>
          )}
        </div>

        {/* Status Box */}
        <div
          className={`p-3 rounded-xl border text-center text-xs font-semibold transition-colors duration-200 ${
            successPlayer
              ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
              : 'bg-slate-950 border-slate-800 text-slate-300'
          }`}
        >
          {successPlayer ? (
            <p className="flex items-center justify-center gap-1.5 font-bold text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> Entry confirmed! Scanning next player in 2 seconds...
            </p>
          ) : (
            <p className="flex items-center justify-center gap-1.5">
              <Camera className="w-4 h-4 text-amber-400" /> {statusMessage}
            </p>
          )}
        </div>

        {/* Manual Fallback */}
        {!hasBlinked && !successPlayer && (
          <button
            type="button"
            onClick={() => setHasBlinked(true)}
            className="w-full text-slate-500 hover:text-slate-300 text-[11px] underline cursor-pointer py-0.5 text-center transition"
          >
            Blink not detecting? Click here to verify liveness manually
          </button>
        )}
      </div>
    </div>
  );
};