import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Camera, Circle, CheckCircle2, AlertCircle, Image, Clock, Download, Play, X, ImageIcon, User, Headphones, Video } from 'lucide-react';
import { toast } from 'sonner';

interface Question {
  id: number;
  text: string;
}

interface SnapshotData {
  questionId: number;
  questionText: string;
  imageData: string;
  timestamp: Date;
  source: 'agent' | 'client';
}

interface SessionRecording {
  videoBlob: Blob;
  videoUrl: string;
}

const KYC_QUESTIONS: Question[] = [
  { id: 1, text: "Please state your full legal name" },
  { id: 2, text: "What is your date of birth?" },
  { id: 3, text: "What is your current residential address?" },
  { id: 4, text: "What is the purpose of this verification?" },
  { id: 5, text: "Do you agree to the terms and conditions?" },
];

export default function KYCVerification() {
  const [isStarted, setIsStarted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  
  const [agentStream, setAgentStream] = useState<MediaStream | null>(null);
  const [clientStream, setClientStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([]);
  const [sessionRecording, setSessionRecording] = useState<SessionRecording | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [showClientFlash, setShowClientFlash] = useState(false);
  
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const [showClientCountdown, setShowClientCountdown] = useState(false);
  const [clientCountdownValue, setClientCountdownValue] = useState(5);

  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [previewItem, setPreviewItem] = useState<{ type: 'video' | 'image'; url: string; title: string } | null>(null);

  const agentVideoRef = useRef<HTMLVideoElement>(null);
  const clientVideoRef = useRef<HTMLVideoElement>(null);
  const agentCanvasRef = useRef<HTMLCanvasElement>(null);
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const combinedCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const currentQuestion = KYC_QUESTIONS[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / KYC_QUESTIONS.length) * 100;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && startTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime.getTime()) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, startTime]);

  useEffect(() => {
    return () => {
      if (agentStream) {
        agentStream.getTracks().forEach(track => track.stop());
      }
      if (clientStream) {
        clientStream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [agentStream, clientStream]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDateTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    });
  };

  const downloadSessionVideo = () => {
    if (sessionRecording) {
      const a = document.createElement('a');
      a.href = sessionRecording.videoUrl;
      a.download = `kyc_session_recording.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Downloaded session recording');
    }
  };

  const downloadSnapshot = (snapshot: SnapshotData) => {
    const a = document.createElement('a');
    a.href = snapshot.imageData;
    a.download = `${snapshot.source}_question_${snapshot.questionId}_snapshot.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(`Downloaded ${snapshot.source} snapshot for Question ${snapshot.questionId}`);
  };

  const drawCombinedFrame = useCallback(() => {
    const canvas = combinedCanvasRef.current;
    const agentVideo = agentVideoRef.current;
    const clientVideo = clientVideoRef.current;
    
    if (!canvas || !agentVideo || !clientVideo) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = 1280;
    canvas.height = 360;
    
    ctx.save();
    ctx.translate(640, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(agentVideo, 0, 0, 640, 360);
    ctx.restore();
    
    ctx.save();
    ctx.translate(1280, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(clientVideo, 0, 0, 640, 360);
    ctx.restore();
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(10, 10, 80, 24);
    ctx.fillRect(650, 10, 80, 24);
    
    ctx.fillStyle = 'white';
    ctx.font = '14px sans-serif';
    ctx.fillText('Agent', 25, 27);
    ctx.fillText('Client', 665, 27);
    
    animationFrameRef.current = requestAnimationFrame(drawCombinedFrame);
  }, []);

  const startCombinedRecording = useCallback(() => {
    const canvas = combinedCanvasRef.current;
    if (!canvas) return;
    
    drawCombinedFrame();
    
    const canvasStream = canvas.captureStream(30);
    
    if (agentStream) {
      const audioTracks = agentStream.getAudioTracks();
      audioTracks.forEach(track => canvasStream.addTrack(track));
    }
    
    const recorder = new MediaRecorder(canvasStream, {
      mimeType: 'video/webm;codecs=vp8,opus'
    });
    
    chunksRef.current = [];
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };
    
    recorder.onstop = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const videoUrl = URL.createObjectURL(blob);
      setSessionRecording({ videoBlob: blob, videoUrl });
      console.log('📹 Combined session recording saved');
    };
    
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    console.log('🔴 Combined session recording started');
  }, [agentStream, drawCombinedFrame]);

  const stopCombinedRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true
      });
      
      const agentMediaStream = mediaStream;
      const clientMediaStream = mediaStream.clone();
      
      setAgentStream(agentMediaStream);
      setClientStream(clientMediaStream);
      
      if (agentVideoRef.current) {
        agentVideoRef.current.srcObject = agentMediaStream;
        await agentVideoRef.current.play().catch(err => {
          console.error('Error playing agent video:', err);
        });
      }

      if (clientVideoRef.current) {
        clientVideoRef.current.srcObject = clientMediaStream;
        await clientVideoRef.current.play().catch(err => {
          console.error('Error playing client video:', err);
        });
      }

      setIsStarted(true);
      setStartTime(new Date());
      
      setTimeout(() => {
        startCombinedRecording();
      }, 500);
      
      toast.success('Verification started - Recording in progress');
    } catch (error) {
      console.error('❌ Camera access error:', error);
      toast.error('Failed to access camera. Please grant camera permissions.');
    }
  };

  const captureSnapshot = useCallback((source: 'agent' | 'client') => {
    const videoRef = source === 'agent' ? agentVideoRef : clientVideoRef;
    const canvasRef = source === 'agent' ? agentCanvasRef : clientCanvasRef;
    
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.95);
        
        const snapshotData: SnapshotData = {
          questionId: currentQuestion.id,
          questionText: currentQuestion.text,
          imageData: imageData,
          timestamp: new Date(),
          source: source
        };
        
        setSnapshots(prev => [...prev, snapshotData]);
        
        setShowClientFlash(true);
        setTimeout(() => setShowClientFlash(false), 200);
        
        console.log(`📸 ${source} Snapshot captured for Question ${currentQuestion.id}`);
        toast.success(`${source === 'agent' ? 'Agent' : 'Client'} snapshot captured!`);
        return snapshotData;
      }
    }
    return null;
  }, [currentQuestion]);

  const startCountdown = useCallback((source: 'agent' | 'client') => {
    setShowClientCountdown(true);
    setClientCountdownValue(5);
    
    const countdownInterval = setInterval(() => {
      setClientCountdownValue(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setShowClientCountdown(false);
          captureSnapshot(source);
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
  }, [captureSnapshot]);

  const handleNextQuestion = () => {
    if (currentQuestionIndex < KYC_QUESTIONS.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      toast.success(`Question ${currentQuestionIndex + 1} completed`);
    } else {
      completeVerification();
    }
  };

  const completeVerification = () => {
    stopCombinedRecording();
    const completionTime = new Date();
    setEndTime(completionTime);
    setIsComplete(true);
    
    console.log('✅ KYC VERIFICATION COMPLETE');
    console.log('====================================');
    console.log('⏰ Start Time:', startTime?.toLocaleString());
    console.log('⏰ End Time:', completionTime.toLocaleString());
    console.log('⏱️ Total Duration:', formatTime(elapsedTime));
    console.log('====================================');
    console.log('📊 Total Questions:', KYC_QUESTIONS.length);
    console.log('📸 Snapshots:', snapshots.length);
    console.log('====================================');
    
    setTimeout(() => {
      setShowVideoModal(true);
    }, 500);
    
    toast.success('Verification completed successfully!');
  };

  if (isComplete) {
    const totalDuration = startTime && endTime 
      ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000) 
      : elapsedTime;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-3 sm:p-4">
        <Card className="max-w-2xl w-full p-4 sm:p-6 md:p-8 text-center space-y-4 sm:space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4 sm:p-6">
              <CheckCircle2 className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-primary" />
            </div>
          </div>
          <div className="space-y-1 sm:space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Verification Complete!</h2>
            <p className="text-muted-foreground text-base sm:text-lg px-2">
              Your KYC verification has been successfully recorded.
            </p>
          </div>

          <Card className="p-4 bg-muted/50 space-y-3">
            <div className="flex items-center justify-center gap-2 text-primary">
              <Clock className="h-5 w-5" />
              <span className="font-semibold">Time Summary</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Start Time</p>
                <p className="font-medium text-foreground">{startTime ? formatDateTime(startTime) : '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">End Time</p>
                <p className="font-medium text-foreground">{endTime ? formatDateTime(endTime) : '-'}</p>
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-muted-foreground text-sm">Total Duration</p>
              <p className="text-2xl font-bold text-primary">{formatTime(totalDuration)}</p>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2 sm:gap-4 pt-2 sm:pt-4">
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-bold text-primary">{KYC_QUESTIONS.length}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Questions</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-bold text-secondary-foreground">{snapshots.length}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Snapshots</p>
            </div>
          </div>

          {sessionRecording && (
            <div className="space-y-3">
              <Button 
                onClick={() => setShowVideoModal(true)}
                className="w-full h-10 sm:h-11 text-sm sm:text-base bg-primary"
              >
                <Play className="mr-2 h-4 w-4" />
                Watch Full Session Recording
              </Button>
              <Button 
                onClick={downloadSessionVideo}
                variant="outline"
                className="w-full h-10 sm:h-11 text-sm sm:text-base"
              >
                <Download className="mr-2 h-4 w-4" />
                Download Recording ({(sessionRecording.videoBlob.size / (1024 * 1024)).toFixed(2)} MB)
              </Button>
            </div>
          )}

          {snapshots.length > 0 && (
            <div className="text-left space-y-3 pt-2">
              <details className="cursor-pointer">
                <summary className="text-sm font-medium text-foreground">📸 Snapshots (Click to view)</summary>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {snapshots.map((snap, idx) => (
                    <div key={`${snap.source}-${snap.questionId}-${idx}`} className="relative group cursor-pointer"
                         onClick={() => setPreviewItem({ type: 'image', url: snap.imageData, title: `${snap.source} Q${snap.questionId}` })}>
                      <img src={snap.imageData} alt={`${snap.source} Q${snap.questionId}`} className="w-full aspect-video object-cover rounded" />
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded">
                        <ImageIcon className="h-6 w-6 text-foreground" />
                      </div>
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-background/80 rounded text-xs font-medium">
                        {snap.source} Q{snap.questionId}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          <div className="pt-2 sm:pt-4">
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
              className="w-full h-10 sm:h-11 text-sm sm:text-base"
            >
              Start New Verification
            </Button>
          </div>
        </Card>

        {showVideoModal && sessionRecording && (
          <div className="fixed inset-0 bg-background/95 z-50 flex items-center justify-center p-4" onClick={() => setShowVideoModal(false)}>
            <div className="max-w-5xl w-full max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  Full Session Recording (Agent + Client)
                </h3>
                <Button onClick={() => setShowVideoModal(false)} variant="ghost" size="icon">
                  <X className="h-6 w-6" />
                </Button>
              </div>
              <video src={sessionRecording.videoUrl} controls autoPlay className="w-full rounded-lg" />
              <div className="mt-4 flex justify-center">
                <Button onClick={downloadSessionVideo} variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Download Recording
                </Button>
              </div>
            </div>
          </div>
        )}

        {previewItem && (
          <div className="fixed inset-0 bg-background/95 z-[60] flex items-center justify-center p-4" onClick={() => setPreviewItem(null)}>
            <div className="max-w-4xl w-full max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
              <Button onClick={() => setPreviewItem(null)} variant="ghost" size="icon" className="absolute -top-12 right-0 text-foreground">
                <X className="h-6 w-6" />
              </Button>
              <h3 className="text-lg font-semibold text-foreground mb-4">{previewItem.title}</h3>
              <img src={previewItem.url} alt={previewItem.title} className="w-full rounded-lg" />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-3 sm:p-4">
        <Card className="max-w-2xl w-full p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
          <div className="text-center space-y-3 sm:space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-trust-gradient p-4 sm:p-6">
                <Camera className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 text-primary-foreground" />
              </div>
            </div>
            <div className="space-y-1 sm:space-y-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">KYC Verification</h1>
              <p className="text-muted-foreground text-base sm:text-lg">
                Complete your identity verification in minutes
              </p>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4 border-t border-border pt-4 sm:pt-6">
            <h3 className="font-semibold text-foreground text-sm sm:text-base">What you'll need:</h3>
            <ul className="space-y-2 sm:space-y-3">
              <li className="flex items-start gap-2 sm:gap-3">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground text-sm sm:text-base">A device with camera and microphone</span>
              </li>
              <li className="flex items-start gap-2 sm:gap-3">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground text-sm sm:text-base">A quiet, well-lit environment</span>
              </li>
              <li className="flex items-start gap-2 sm:gap-3">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground text-sm sm:text-base">5 minutes to answer verification questions</span>
              </li>
            </ul>
          </div>

          <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4">
            <Button 
              onClick={startCamera} 
              className="w-full bg-trust-gradient hover:opacity-90 text-primary-foreground text-base sm:text-lg h-12 sm:h-14"
            >
              <Camera className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              Start Verification
            </Button>
            <p className="text-xs text-center text-muted-foreground px-2">
              By continuing, you agree to be recorded for verification purposes
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 py-4 sm:py-6 md:py-8">
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">Identity Verification</h2>
            <div className="flex items-center gap-3 sm:gap-4">
              {isRecording && (
                <div className="flex items-center gap-1.5 text-primary">
                  <Clock className="h-4 w-4" />
                  <span className="font-mono font-medium text-sm sm:text-base">{formatTime(elapsedTime)}</span>
                </div>
              )}
              <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                <span className="font-medium text-primary whitespace-nowrap">
                  {currentQuestionIndex + 1}/{KYC_QUESTIONS.length}
                </span>
              </div>
            </div>
          </div>
          <Progress value={progress} className="h-1.5 sm:h-2" />
        </div>

        <Card className="p-4 sm:p-5">
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="rounded-full bg-primary/10 p-1.5 sm:p-2 flex-shrink-0">
              <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="space-y-1 sm:space-y-2 flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-sm sm:text-base">Question {currentQuestionIndex + 1}</h3>
              <p className="text-base sm:text-lg text-foreground leading-relaxed">
                {currentQuestion.text}
              </p>
            </div>
            {isRecording && (
              <div className="flex items-center gap-1.5 bg-destructive/90 text-destructive-foreground px-2 py-1 rounded-full animate-pulse">
                <Circle className="h-2 w-2 fill-current" />
                <span className="text-xs font-medium">Recording</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="grid grid-cols-2 gap-0.5 bg-border">
            <div className="bg-background">
              <div className="bg-primary/10 px-2 sm:px-4 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2">
                <Headphones className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                <span className="font-semibold text-foreground text-xs sm:text-sm">Agent</span>
                {isRecording && (
                  <div className="ml-auto flex items-center gap-1 bg-destructive/90 text-destructive-foreground px-1.5 py-0.5 rounded-full animate-pulse">
                    <Circle className="h-1.5 w-1.5 fill-current" />
                    <span className="text-[10px] font-medium hidden sm:inline">REC</span>
                  </div>
                )}
              </div>
              <div className="relative">
                <div className="aspect-video bg-muted">
                  <video
                    ref={agentVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                </div>
                <canvas ref={agentCanvasRef} className="hidden" />
              </div>
            </div>

            <div className="bg-background">
              <div className="bg-accent/10 px-2 sm:px-4 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2">
                <User className="h-3 w-3 sm:h-4 sm:w-4 text-accent" />
                <span className="font-semibold text-foreground text-xs sm:text-sm">Client</span>
                {isRecording && (
                  <div className="ml-auto flex items-center gap-1 bg-destructive/90 text-destructive-foreground px-1.5 py-0.5 rounded-full animate-pulse">
                    <Circle className="h-1.5 w-1.5 fill-current" />
                    <span className="text-[10px] font-medium hidden sm:inline">REC</span>
                  </div>
                )}
              </div>
              <div className="relative">
                {showClientFlash && (
                  <div className="absolute inset-0 bg-snapshot-flash z-50 animate-pulse pointer-events-none" />
                )}
                
                {showClientCountdown && (
                  <div className="absolute inset-0 bg-background/80 z-40 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-4xl sm:text-6xl font-bold text-accent animate-pulse">
                        {clientCountdownValue}
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="aspect-video bg-muted">
                  <video
                    ref={clientVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                </div>
                <canvas ref={clientCanvasRef} className="hidden" />
              </div>
            </div>
          </div>
          
          <div className="p-3 sm:p-4 border-t border-border">
            <Button
              onClick={() => startCountdown('client')}
              variant="outline"
              disabled={showClientCountdown}
              className="w-full h-9 sm:h-10 text-xs sm:text-sm border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            >
              <Image className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              {showClientCountdown ? `Capturing in ${clientCountdownValue}...` : 'Capture Client Snapshot (5s)'}
            </Button>
          </div>
        </Card>

        <canvas ref={combinedCanvasRef} className="hidden" />

        <Button
          onClick={handleNextQuestion}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 sm:h-12 text-sm sm:text-base"
        >
          {currentQuestionIndex < KYC_QUESTIONS.length - 1 ? (
            <>Next Question</>
          ) : (
            <>Complete Verification</>
          )}
        </Button>

        <Card className="p-3 sm:p-4">
          <h4 className="text-xs sm:text-sm font-medium text-foreground mb-2 sm:mb-3">Questions Progress</h4>
          <div className="flex flex-wrap gap-2">
            {KYC_QUESTIONS.map((q, idx) => (
              <div key={q.id} className="flex items-center gap-1.5 sm:gap-2 bg-muted px-2 py-1 rounded">
                {idx < currentQuestionIndex ? (
                  <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
                ) : idx === currentQuestionIndex ? (
                  <Circle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent flex-shrink-0 fill-current" />
                ) : (
                  <Circle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/30 flex-shrink-0" />
                )}
                <span className={`text-xs sm:text-sm ${
                  idx <= currentQuestionIndex 
                    ? 'text-foreground font-medium' 
                    : 'text-muted-foreground'
                }`}>
                  Q{idx + 1}
                </span>
                {snapshots.some(s => s.questionId === q.id) && (
                  <span className="text-xs">📸</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-3 sm:p-4 bg-muted/50">
          <details className="cursor-pointer">
            <summary className="text-xs sm:text-sm font-medium text-foreground mb-2">
              Developer Console (Click to expand)
            </summary>
            <div className="text-xs text-muted-foreground space-y-1 font-mono">
              <p>📊 Current Question: {currentQuestionIndex + 1}/{KYC_QUESTIONS.length}</p>
              <p>📸 Snapshots: {snapshots.length}</p>
              <p>🔴 Recording: {isRecording ? 'Active (Combined)' : 'Inactive'}</p>
              <p>⏱️ Elapsed: {formatTime(elapsedTime)}</p>
            </div>
          </details>
        </Card>
      </div>
    </div>
  );
}