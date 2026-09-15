import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, X, ScanFace, UserCheck } from 'lucide-react';
import { faceService } from '../faceRecognition';
import { arenaAudio } from '../audioEngine';

interface FaceAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayerVerified: (playerId: string) => void;
  players: { id: string; name: string; jersey: number; descriptor?: number[] }[];
}

export const FaceAttendanceModal: React.FC<FaceAttendanceModalProps> = ({
  isOpen,
  onClose,
  onPlayerVerified,
  players
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [statusText, setStatusText] = useState('Initializing Face Recognition Models...');
  const [detectedPlayer, setDetectedPlayer] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    let isScanning = true;
    let scanInterval: number | null = null;

    async function setupCameraAndRecognition() {
      try {
        await faceService.loadModels();
        setStatusText('Loading roster biometric data...');

        const rosterData = players
          .filter(p => p.descriptor)
          .map(p => ({ id: p.id, name: p.name, jersey: p.jersey, descriptor: p.descriptor! }));
        
        faceService.initializeMatcher(rosterData);

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 360, facingMode: 'user' }
        });
        streamRef.current = mediaStream;

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
        }

        setStatusText('Look directly at the camera to check in...');

        scanInterval = window.setInterval(async () => {
          if (!videoRef.current || !isScanning) return;

          const matchedPlayerId = await faceService.recognizeLiveFace(videoRef.current);

          if (matchedPlayerId) {
            const player = players.find(p => p.id === matchedPlayerId);
            if (player) {
              isScanning = false;
              if (scanInterval) clearInterval(scanInterval);

              arenaAudio.playWhistle();
              setDetectedPlayer(`${player.name} (#${player.jersey})`);
              setStatusText('Match Confirmed! Unlocking Desk...');
              onPlayerVerified(player.id);
              
              setTimeout(() => {
                handleClose();
              }, 1200);
            }
          }
        }, 600);

      } catch (err) {
        setStatusText('Camera access denied or models failed to load.');
      }
    }

    setupCameraAndRecognition();

    return () => {
      isScanning = false;
      if (scanInterval) clearInterval(scanInterval);
      stopCamera();
    };
  }, [isOpen, players, onPlayerVerified]);

  const handleEnrollCurrentFace = async () => {
    if (!videoRef.current) return;
    setIsEnrolling(true);
    setStatusText('Capturing face vector for Player...');
    
    try {
      const detection = await faceService.extractDescriptorFromImage(videoRef.current as unknown as HTMLImageElement);
      
      if (detection) {
        const target = players.find(p => p.id === 'p1') || players[0];
        if (target) {
          target.descriptor = detection;
          faceService.initializeMatcher(players.filter(p => p.descriptor).map(p => ({
            id: p.id,
            name: p.name,
            jersey: p.jersey,
            descriptor: p.descriptor!
          })));
          setStatusText('Face enrolled! Now looking for matches...');
        }
      } else {
        setStatusText('No face detected. Center your face in the reticle.');
      }
    } catch {
      setStatusText('Enrollment failed. Ensure good lighting.');
    } finally {
      setIsEnrolling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-amber-400" /> Scorer Desk Face ID Kiosk
          </h3>
          <button type="button" onClick={handleClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Camera Viewport with Facial Reticle */}
        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-700 flex items-center justify-center">
          <video 
            ref={videoRef} 
            muted 
            playsInline 
            className="w-full h-full object-cover transform scale-x-[-1]" 
          />
          {/* Target Face Guide Reticle */}
          <div className="absolute inset-0 border-2 border-dashed border-amber-400/40 m-10 rounded-3xl pointer-events-none flex items-center justify-center">
            <div className="w-full h-0.5 bg-amber-400/20 animate-pulse" />
          </div>
        </div>

        {/* Match Confirmation Bar */}
        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs font-semibold">
          {detectedPlayer ? (
            <p className="text-emerald-400 flex items-center justify-center gap-1.5 font-bold">
              <CheckCircle2 className="w-4 h-4" /> {detectedPlayer} Verified!
            </p>
          ) : (
            <p className="text-slate-400 animate-pulse flex items-center justify-center gap-1.5">
              <Camera className="w-4 h-4 text-amber-400" /> {statusText}
            </p>
          )}
        </div>

        {/* Enrollment Trigger for Testing */}
        <button
          type="button"
          disabled={isEnrolling}
          onClick={handleEnrollCurrentFace}
          className="w-full bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-amber-400 font-bold py-2.5 rounded-xl text-xs border border-slate-700 cursor-pointer flex items-center justify-center gap-2 transition"
        >
          <UserCheck className="w-4 h-4" />
          {isEnrolling ? 'Enrolling Face...' : 'Enroll Current Camera Face'}
        </button>
      </div>
    </div>
  );
};