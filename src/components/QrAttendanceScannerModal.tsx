import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, QrCode, CheckCircle2, UserCheck, RefreshCw } from 'lucide-react';
import { arenaAudio } from '../audioEngine';
import type { Player } from '../App';

interface QrAttendanceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayerVerified: (playerId: string) => void;
  players: Player[];
}

export const QrAttendanceScannerModal: React.FC<QrAttendanceScannerModalProps> = ({
  isOpen,
  onClose,
  onPlayerVerified,
  players,
}) => {
  const qrRegionId = 'qr-reader-kiosk-box';
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const [statusMessage, setStatusMessage] = useState('Initializing QR Scanner Camera...');
  const [successPlayer, setSuccessPlayer] = useState<{ name: string; jersey: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const playersRef = useRef(players);
  playersRef.current = players;

  const onPlayerVerifiedRef = useRef(onPlayerVerified);
  onPlayerVerifiedRef.current = onPlayerVerified;

  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Error stopping QR scanner:', err);
      }
      html5QrCodeRef.current = null;
    }
  }, []);

  const handleClose = useCallback(async () => {
    await stopScanner();
    onClose();
  }, [stopScanner, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;
    let isPausedForCelebration = false;
    let resetTimeout: NodeJS.Timeout | null = null;

    setSuccessPlayer(null);
    setIsLoading(true);
    setStatusMessage('Starting camera for QR scan...');

    async function startScanner() {
      try {
        // Stop any lingering instance before launching a new one
        await stopScanner();

        if (!isSubscribed) return;

        const html5QrCode = new Html5Qrcode(qrRegionId);
        html5QrCodeRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'user' },
          {
            fps: 15,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            // Check if paused during green success card
            if (isPausedForCelebration) return;

            const trimmedPass = decodedText.trim();
            const matchedPlayer = playersRef.current.find(
              (p) => p.qrPassId === trimmedPass || String(p.id) === trimmedPass
            );

            if (matchedPlayer) {
              isPausedForCelebration = true;

              // Play whistle and sound feedback
              arenaAudio.playWhistle();

              // Trigger green success overlay
              setSuccessPlayer({
                name: matchedPlayer.name,
                jersey: matchedPlayer.jersey,
              });
              setStatusMessage(`Verified: ${matchedPlayer.name} (#${matchedPlayer.jersey})`);

              // Unlock scoring desk
              onPlayerVerifiedRef.current(matchedPlayer.id);

              // Hold green banner for 2 seconds, then seamlessly reset for next QR
              resetTimeout = setTimeout(() => {
                setSuccessPlayer(null);
                setStatusMessage('Ready! Align next player pass QR in the box.');
                isPausedForCelebration = false;
              }, 2000);
            } else {
              setStatusMessage(`Unrecognized pass (${trimmedPass}). Check team roster.`);
            }
          },
          () => {
            // Continuous scanning frame callback (silent ignore frame misses)
          }
        );

        if (isSubscribed) {
          setIsLoading(false);
          setStatusMessage('Align the digital or printed QR pass within the square.');
        }
      } catch (err) {
        console.error('QR scanner launch error:', err);
        if (isSubscribed) {
          setIsLoading(false);
          setStatusMessage('Camera access failed. Check device permissions or webcam availability.');
        }
      }
    }

    // Short timeout to guarantee container DOM node is mounted before initializing Html5Qrcode
    const timer = setTimeout(() => {
      startScanner();
    }, 100);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
      if (resetTimeout) clearTimeout(resetTimeout);
      stopScanner();
    };
  }, [isOpen, stopScanner]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-amber-400" /> Backup QR Attendance Kiosk
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

        {/* Camera Container & Viewport */}
        <div
          className={`relative aspect-square w-full bg-slate-950 rounded-2xl overflow-hidden border-2 transition-all duration-300 flex items-center justify-center ${
            successPlayer ? 'border-emerald-500 shadow-2xl shadow-emerald-500/20' : 'border-slate-800'
          }`}
        >
          {/* Html5Qrcode mounts its video & canvas elements inside this div */}
          <div id={qrRegionId} className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover" />

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-2 z-10">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-xs text-slate-300 font-semibold">Starting QR Scanner...</p>
            </div>
          )}

          {/* Green Confirmation Overlay */}
          {successPlayer && (
            <div className="absolute inset-0 bg-emerald-950/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 space-y-3 z-30 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-400 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 animate-bounce" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-900/80 px-3 py-0.5 rounded-full border border-emerald-500/50">
                  QR Pass Confirmed
                </span>
                <h2 className="text-2xl font-black text-white mt-2">{successPlayer.name}</h2>
                <p className="text-sm font-mono font-bold text-emerald-400">Jersey #{successPlayer.jersey}</p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-200 bg-emerald-900/60 px-3 py-1.5 rounded-lg border border-emerald-700/50 font-semibold">
                <UserCheck className="w-4 h-4 text-emerald-400" /> Attendance Confirmed • Desk Unlocked
              </div>
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
              <CheckCircle2 className="w-4 h-4" /> Entry confirmed! Scanning next pass in 2 seconds...
            </p>
          ) : (
            <p className="flex items-center justify-center gap-1.5">
              <QrCode className="w-4 h-4 text-amber-400" /> {statusMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};