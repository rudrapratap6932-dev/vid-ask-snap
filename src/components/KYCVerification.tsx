import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Camera, Circle, CheckCircle2, AlertCircle, Image, Clock, Download, Play, FolderOpen, X, Video, ImageIcon, User, Headphones } from 'lucide-react';
import { toast } from 'sonner';

interface Question {
  id: number;
  text: string;
}

interface QuestionClip {
  questionId: number;
  questionText: string;
  videoBlob: Blob;
  videoUrl: string;
  source: 'agent' | 'client';
}

interface SnapshotData {
  questionId: number;
  questionText: string;
  imageData: string;
  timestamp: Date;
  source: 'agent' | 'client';
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
  
  // Agent streams
  const [agentStream, setAgentStream] = useState<MediaStream | null>(null);
  const [agentMediaRecorder, setAgentMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isAgentRecording, setIsAgentRecording] = useState(false);
  
  // Client streams
  const [clientStream, setClientStream] = useState<MediaStream | null>(null);
  const [clientMediaRecorder, setClientMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isClientRecording, setIsClientRecording] = useState(false);
  
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([]);
  const [questionClips, setQuestionClips] = useState<QuestionClip[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [showAgentFlash, setShowAgentFlash] = useState(false);
  const [showClientFlash, setShowClientFlash] = useState(false);
  
  // Timer states
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  // Countdown states
  const [showAgentCountdown, setShowAgentCountdown] = useState(false);
  const [showClientCountdown, setShowClientCountdown] = useState(false);
  const [agentCountdownValue, setAgentCountdownValue] = useState(5);
  const [clientCountdownValue, setClientCountdownValue] = useState(5);

  // Gallery states
  const [showGallery, setShowGallery] = useState(false);
  const [previewItem, setPreviewItem] = useState<{ type: 'video' | 'image'; url: string; title: string } | null>(null);

  const agentVideoRef = useRef<HTMLVideoElement>(null);
  const clientVideoRef = useRef<HTMLVideoElement>(null);
  const agentCanvasRef = useRef<HTMLCanvasElement>(null);
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const agentChunksRef = useRef<Blob[]>([]);
  const clientChunksRef = useRef<Blob[]>([]);
  const currentChunksRef = useRef<Blob[]>([]);

  const currentQuestion = KYC_QUESTIONS[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / KYC_QUESTIONS.length) * 100;

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if ((isAgentRecording || isClientRecording) && startTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime.getTime()) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isAgentRecording, isClientRecording, startTime]);

  useEffect(() => {
    return () => {
      if (agentStream) {
        agentStream.getTracks().forEach(track => track.stop());
      }
      if (clientStream) {
        clientStream.getTracks().forEach(track => track.stop());
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

  const downloadVideoClip = (clip: QuestionClip) => {
    const a = document.createElement('a');
    a.href = clip.videoUrl;
    a.download = `${clip.source}_question_${clip.questionId}_clip.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(`Downloaded ${clip.source} clip for Question ${clip.questionId}`);
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

  const downloadAllFiles = () => {
    questionClips.forEach((clip, idx) => {
      setTimeout(() => downloadVideoClip(clip), idx * 500);
    });
    snapshots.forEach((snap, idx) => {
      setTimeout(() => downloadSnapshot(snap), (questionClips.length + idx) * 500);
    });
    toast.success('Downloading all files...');
  };

  const startCamera = async () => {
    try {
      // For demo, we use the same camera for both - in real scenario, agent would have separate stream
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true
      });
      
      // Clone stream for both agent and client
      setAgentStream(mediaStream);
      setClientStream(mediaStream.clone());
      
      if (agentVideoRef.current) {
        agentVideoRef.current.srcObject = mediaStream;
        await agentVideoRef.current.play().catch(err => {
          console.error('Error playing agent video:', err);
        });
      }

      if (clientVideoRef.current) {
        clientVideoRef.current.srcObject = mediaStream.clone();
        await clientVideoRef.current.play().catch(err => {
          console.error('Error playing client video:', err);
        });
      }

      setIsStarted(true);
      toast.success('Cameras connected successfully');
    } catch (error) {
      console.error('❌ Camera access error:', error);
      toast.error('Failed to access camera. Please grant camera permissions.');
    }
  };

  const startRecording = useCallback((source: 'agent' | 'client') => {
    const stream = source === 'agent' ? agentStream : clientStream;
    if (!stream) return;

    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8,opus'
    });

    const chunksRef = source === 'agent' ? agentChunksRef : clientChunksRef;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const videoUrl = URL.createObjectURL(blob);
      
      const clip: QuestionClip = {
        questionId: currentQuestion.id,
        questionText: currentQuestion.text,
        videoBlob: blob,
        videoUrl: videoUrl,
        source: source
      };

      setQuestionClips(prev => [...prev, clip]);
      console.log(`📹 ${source} Question ${currentQuestion.id} clip saved`);
    };

    recorder.start();
    
    if (source === 'agent') {
      setAgentMediaRecorder(recorder);
      setIsAgentRecording(true);
    } else {
      setClientMediaRecorder(recorder);
      setIsClientRecording(true);
    }
    
    if (!startTime) {
      setStartTime(new Date());
    }
    
    toast.info(`${source === 'agent' ? 'Agent' : 'Client'} recording started for Question ${currentQuestionIndex + 1}`);
  }, [agentStream, clientStream, currentQuestion, currentQuestionIndex, startTime]);

  const stopRecording = useCallback((source: 'agent' | 'client') => {
    const recorder = source === 'agent' ? agentMediaRecorder : clientMediaRecorder;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
    if (source === 'agent') {
      setIsAgentRecording(false);
    } else {
      setIsClientRecording(false);
    }
  }, [agentMediaRecorder, clientMediaRecorder]);

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
        
        if (source === 'agent') {
          setShowAgentFlash(true);
          setTimeout(() => setShowAgentFlash(false), 200);
        } else {
          setShowClientFlash(true);
          setTimeout(() => setShowClientFlash(false), 200);
        }
        
        console.log(`📸 ${source} Snapshot captured for Question ${currentQuestion.id}`);
        toast.success(`${source === 'agent' ? 'Agent' : 'Client'} snapshot captured!`);
        return snapshotData;
      }
    }
    return null;
  }, [currentQuestion]);

  const startCountdown = useCallback((source: 'agent' | 'client') => {
    if (source === 'agent') {
      setShowAgentCountdown(true);
      setAgentCountdownValue(5);
    } else {
      setShowClientCountdown(true);
      setClientCountdownValue(5);
    }
    
    const countdownInterval = setInterval(() => {
      if (source === 'agent') {
        setAgentCountdownValue(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            setShowAgentCountdown(false);
            captureSnapshot('agent');
            return 5;
          }
          return prev - 1;
        });
      } else {
        setClientCountdownValue(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            setShowClientCountdown(false);
            captureSnapshot('client');
            return 5;
          }
          return prev - 1;
        });
      }
    }, 1000);
  }, [captureSnapshot]);

  const handleNextQuestion = () => {
    stopRecording('agent');
    stopRecording('client');
    
    if (currentQuestionIndex < KYC_QUESTIONS.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      toast.success(`Question ${currentQuestionIndex + 1} completed`);
    } else {
      completeVerification();
    }
  };

  const completeVerification = () => {
    setIsAgentRecording(false);
    setIsClientRecording(false);
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
    console.log('📹 Video Clips:', questionClips.length);
    console.log('📸 Snapshots:', snapshots.length);
    console.log('====================================');
    
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

          {/* Time Summary */}
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

          <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-2 sm:pt-4">
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-bold text-primary">{KYC_QUESTIONS.length}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Questions</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-bold text-accent">{questionClips.length}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Video Clips</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-bold text-secondary-foreground">{snapshots.length}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Snapshots</p>
            </div>
          </div>

          {/* Files Summary */}
          <div className="text-left space-y-3 pt-2">
            <details className="cursor-pointer">
              <summary className="text-sm font-medium text-foreground">📁 Uploaded Files (Click to view)</summary>
              <div className="mt-2 space-y-2 text-xs font-mono">
                <div className="p-2 bg-muted rounded">
                  <p className="font-semibold text-foreground mb-1">📹 /uploads/video_clips/</p>
                  {questionClips.map((clip) => (
                    <p key={clip.questionId} className="text-muted-foreground pl-4">
                      └ question_{clip.questionId}_clip.webm ({(clip.videoBlob.size / 1024).toFixed(1)} KB)
                    </p>
                  ))}
                </div>
                <div className="p-2 bg-muted rounded">
                  <p className="font-semibold text-foreground mb-1">📸 /uploads/snapshots/</p>
                  {snapshots.map((snap) => (
                    <p key={snap.questionId} className="text-muted-foreground pl-4">
                      └ question_{snap.questionId}_snapshot.jpg
                    </p>
                  ))}
                </div>
              </div>
            </details>
          </div>

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
        {/* Header with Progress and Timer */}
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">Identity Verification</h2>
            <div className="flex items-center gap-3 sm:gap-4">
              {(isAgentRecording || isClientRecording) && (
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

        {/* Question Display */}
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
          </div>
        </Card>

        {/* Split Screen Video Layout */}
        <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
          {/* Agent Side (Left) */}
          <Card className="overflow-hidden">
            <div className="bg-primary/10 px-4 py-2 flex items-center gap-2">
              <Headphones className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <span className="font-semibold text-foreground text-sm sm:text-base">Live Support Agent</span>
              {isAgentRecording && (
                <div className="ml-auto flex items-center gap-1.5 bg-destructive/90 text-destructive-foreground px-2 py-0.5 rounded-full animate-pulse">
                  <Circle className="h-2 w-2 fill-current" />
                  <span className="text-xs font-medium">REC</span>
                </div>
              )}
            </div>
            <div className="relative">
              {showAgentFlash && (
                <div className="absolute inset-0 bg-snapshot-flash z-50 animate-pulse pointer-events-none" />
              )}
              
              {/* Agent Countdown Overlay */}
              {showAgentCountdown && (
                <div className="absolute inset-0 bg-background/80 z-40 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="text-5xl sm:text-7xl font-bold text-primary animate-pulse">
                      {agentCountdownValue}
                    </div>
                    <p className="text-base sm:text-lg text-foreground font-medium">Get Ready!</p>
                  </div>
                </div>
              )}
              
              <div className="aspect-video bg-muted relative">
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
            
            {/* Agent Controls */}
            <div className="p-3 sm:p-4 space-y-2">
              {!isAgentRecording ? (
                <Button
                  onClick={() => startRecording('agent')}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-9 sm:h-10 text-xs sm:text-sm"
                >
                  <Circle className="mr-2 h-3 w-3" />
                  Start Recording
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={() => startCountdown('agent')}
                    variant="outline"
                    disabled={showAgentCountdown}
                    className="w-full h-9 sm:h-10 text-xs sm:text-sm border-accent text-accent hover:bg-accent hover:text-accent-foreground"
                  >
                    <Image className="mr-2 h-3 w-3" />
                    {showAgentCountdown ? `Capturing in ${agentCountdownValue}...` : 'Capture Snapshot (5s)'}
                  </Button>
                  <Button
                    onClick={() => stopRecording('agent')}
                    variant="destructive"
                    className="w-full h-9 sm:h-10 text-xs sm:text-sm"
                  >
                    <Circle className="mr-2 h-3 w-3 fill-current" />
                    Stop Recording
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Client Side (Right) */}
          <Card className="overflow-hidden">
            <div className="bg-accent/10 px-4 py-2 flex items-center gap-2">
              <User className="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
              <span className="font-semibold text-foreground text-sm sm:text-base">Client Video</span>
              {isClientRecording && (
                <div className="ml-auto flex items-center gap-1.5 bg-destructive/90 text-destructive-foreground px-2 py-0.5 rounded-full animate-pulse">
                  <Circle className="h-2 w-2 fill-current" />
                  <span className="text-xs font-medium">REC</span>
                </div>
              )}
            </div>
            <div className="relative">
              {showClientFlash && (
                <div className="absolute inset-0 bg-snapshot-flash z-50 animate-pulse pointer-events-none" />
              )}
              
              {/* Client Countdown Overlay */}
              {showClientCountdown && (
                <div className="absolute inset-0 bg-background/80 z-40 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="text-5xl sm:text-7xl font-bold text-accent animate-pulse">
                      {clientCountdownValue}
                    </div>
                    <p className="text-base sm:text-lg text-foreground font-medium">Get Ready!</p>
                  </div>
                </div>
              )}
              
              <div className="aspect-video bg-muted relative">
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
            
            {/* Client Controls */}
            <div className="p-3 sm:p-4 space-y-2">
              {!isClientRecording ? (
                <Button
                  onClick={() => startRecording('client')}
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground h-9 sm:h-10 text-xs sm:text-sm"
                >
                  <Circle className="mr-2 h-3 w-3" />
                  Start Recording
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={() => startCountdown('client')}
                    variant="outline"
                    disabled={showClientCountdown}
                    className="w-full h-9 sm:h-10 text-xs sm:text-sm border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    <Image className="mr-2 h-3 w-3" />
                    {showClientCountdown ? `Capturing in ${clientCountdownValue}...` : 'Capture Snapshot (5s)'}
                  </Button>
                  <Button
                    onClick={() => stopRecording('client')}
                    variant="destructive"
                    className="w-full h-9 sm:h-10 text-xs sm:text-sm"
                  >
                    <Circle className="mr-2 h-3 w-3 fill-current" />
                    Stop Recording
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Next Question Button */}
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

        {/* Progress Indicators */}
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
                {questionClips.some(c => c.questionId === q.id && c.source === 'agent') && (
                  <span className="text-xs text-primary">🎤</span>
                )}
                {questionClips.some(c => c.questionId === q.id && c.source === 'client') && (
                  <span className="text-xs text-accent">📹</span>
                )}
                {snapshots.some(s => s.questionId === q.id) && (
                  <span className="text-xs">📸</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* File Gallery Button */}
        {(questionClips.length > 0 || snapshots.length > 0) && (
          <Button
            onClick={() => setShowGallery(true)}
            variant="outline"
            className="w-full h-10 sm:h-11 text-sm sm:text-base"
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            View Uploads ({questionClips.length} clips, {snapshots.length} snapshots)
          </Button>
        )}

        {/* File Gallery Modal */}
        {showGallery && (
          <div className="fixed inset-0 bg-background/95 z-50 overflow-auto">
            <div className="max-w-6xl mx-auto p-4 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                  <FolderOpen className="h-6 w-6" />
                  Uploads Folder
                </h2>
                <div className="flex items-center gap-2">
                  {(questionClips.length > 0 || snapshots.length > 0) && (
                    <Button onClick={downloadAllFiles} variant="outline" size="sm">
                      <Download className="mr-2 h-4 w-4" />
                      Download All
                    </Button>
                  )}
                  <Button onClick={() => setShowGallery(false)} variant="ghost" size="icon">
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Agent Video Clips Section */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Headphones className="h-5 w-5 text-primary" />
                  Agent Video Clips ({questionClips.filter(c => c.source === 'agent').length})
                </h3>
                {questionClips.filter(c => c.source === 'agent').length === 0 ? (
                  <p className="text-muted-foreground text-sm">No agent clips recorded yet</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {questionClips.filter(c => c.source === 'agent').map((clip, idx) => (
                      <Card key={`agent-${clip.questionId}-${idx}`} className="overflow-hidden">
                        <div className="aspect-video bg-muted relative group cursor-pointer"
                             onClick={() => setPreviewItem({ type: 'video', url: clip.videoUrl, title: `Agent Q${clip.questionId} Clip` })}>
                          <video src={clip.videoUrl} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-background/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="h-12 w-12 text-primary" />
                          </div>
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="font-medium text-foreground text-sm">Agent Q{clip.questionId}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{(clip.videoBlob.size / 1024).toFixed(1)} KB</span>
                            <Button onClick={(e) => { e.stopPropagation(); downloadVideoClip(clip); }} size="sm" variant="ghost">
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Client Video Clips Section */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <User className="h-5 w-5 text-accent" />
                  Client Video Clips ({questionClips.filter(c => c.source === 'client').length})
                </h3>
                {questionClips.filter(c => c.source === 'client').length === 0 ? (
                  <p className="text-muted-foreground text-sm">No client clips recorded yet</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {questionClips.filter(c => c.source === 'client').map((clip, idx) => (
                      <Card key={`client-${clip.questionId}-${idx}`} className="overflow-hidden">
                        <div className="aspect-video bg-muted relative group cursor-pointer"
                             onClick={() => setPreviewItem({ type: 'video', url: clip.videoUrl, title: `Client Q${clip.questionId} Clip` })}>
                          <video src={clip.videoUrl} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-background/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="h-12 w-12 text-accent" />
                          </div>
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="font-medium text-foreground text-sm">Client Q{clip.questionId}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{(clip.videoBlob.size / 1024).toFixed(1)} KB</span>
                            <Button onClick={(e) => { e.stopPropagation(); downloadVideoClip(clip); }} size="sm" variant="ghost">
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Snapshots Section */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-accent" />
                  Snapshots ({snapshots.length})
                </h3>
                {snapshots.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No snapshots captured yet</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {snapshots.map((snap, idx) => (
                      <Card key={`${snap.source}-${snap.questionId}-${idx}`} className="overflow-hidden">
                        <div className="aspect-square bg-muted relative group cursor-pointer"
                             onClick={() => setPreviewItem({ type: 'image', url: snap.imageData, title: `${snap.source} Q${snap.questionId} Snapshot` })}>
                          <img src={snap.imageData} alt={`${snap.source} Snapshot Q${snap.questionId}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-background/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <ImageIcon className="h-10 w-10 text-accent" />
                          </div>
                          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-background/80 rounded text-xs font-medium">
                            {snap.source === 'agent' ? '🎤' : '📹'}
                          </div>
                        </div>
                        <div className="p-2 space-y-1">
                          <p className="font-medium text-foreground text-xs capitalize">{snap.source} Q{snap.questionId}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{snap.timestamp.toLocaleTimeString()}</span>
                            <Button onClick={(e) => { e.stopPropagation(); downloadSnapshot(snap); }} size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {previewItem && (
          <div className="fixed inset-0 bg-background/95 z-[60] flex items-center justify-center p-4" onClick={() => setPreviewItem(null)}>
            <div className="max-w-4xl w-full max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
              <Button onClick={() => setPreviewItem(null)} variant="ghost" size="icon" className="absolute -top-12 right-0 text-foreground">
                <X className="h-6 w-6" />
              </Button>
              <h3 className="text-lg font-semibold text-foreground mb-4">{previewItem.title}</h3>
              {previewItem.type === 'video' ? (
                <video src={previewItem.url} controls autoPlay className="w-full rounded-lg" />
              ) : (
                <img src={previewItem.url} alt={previewItem.title} className="w-full rounded-lg" />
              )}
            </div>
          </div>
        )}

        {/* Debug Info */}
        <Card className="p-3 sm:p-4 bg-muted/50">
          <details className="cursor-pointer">
            <summary className="text-xs sm:text-sm font-medium text-foreground mb-2">
              Developer Console (Click to expand)
            </summary>
            <div className="text-xs text-muted-foreground space-y-1 font-mono">
              <p>📊 Current Question: {currentQuestionIndex + 1}/{KYC_QUESTIONS.length}</p>
              <p>📹 Agent Clips: {questionClips.filter(c => c.source === 'agent').length}</p>
              <p>📹 Client Clips: {questionClips.filter(c => c.source === 'client').length}</p>
              <p>📸 Snapshots: {snapshots.length}</p>
              <p>🔴 Agent Recording: {isAgentRecording ? 'Active' : 'Inactive'}</p>
              <p>🔴 Client Recording: {isClientRecording ? 'Active' : 'Inactive'}</p>
              <p>⏱️ Elapsed: {formatTime(elapsedTime)}</p>
            </div>
          </details>
        </Card>
      </div>
    </div>
  );
}