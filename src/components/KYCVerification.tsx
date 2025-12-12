import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Camera, Circle, CheckCircle2, AlertCircle, Image, Clock, Download, Play, FolderOpen, X, Video, ImageIcon } from 'lucide-react';
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
}

interface SnapshotData {
  questionId: number;
  questionText: string;
  imageData: string;
  timestamp: Date;
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
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([]);
  const [questionClips, setQuestionClips] = useState<QuestionClip[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  
  // Timer states
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  // Countdown states
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(5);

  // Gallery states
  const [showGallery, setShowGallery] = useState(false);
  const [previewItem, setPreviewItem] = useState<{ type: 'video' | 'image'; url: string; title: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentChunksRef = useRef<Blob[]>([]);

  const currentQuestion = KYC_QUESTIONS[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / KYC_QUESTIONS.length) * 100;

  // Timer effect
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
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

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
    a.download = `question_${clip.questionId}_clip.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(`Downloaded clip for Question ${clip.questionId}`);
  };

  const downloadSnapshot = (snapshot: SnapshotData) => {
    const a = document.createElement('a');
    a.href = snapshot.imageData;
    a.download = `question_${snapshot.questionId}_snapshot.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(`Downloaded snapshot for Question ${snapshot.questionId}`);
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
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(err => {
          console.error('Error playing video:', err);
        });
      }

      setIsStarted(true);
      toast.success('Camera connected successfully');
    } catch (error) {
      console.error('❌ Camera access error:', error);
      toast.error('Failed to access camera. Please grant camera permissions.');
    }
  };

  const startQuestionRecording = useCallback(() => {
    if (!stream) return;

    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8,opus'
    });

    currentChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        currentChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(currentChunksRef.current, { type: 'video/webm' });
      const videoUrl = URL.createObjectURL(blob);
      
      const clip: QuestionClip = {
        questionId: currentQuestion.id,
        questionText: currentQuestion.text,
        videoBlob: blob,
        videoUrl: videoUrl
      };

      setQuestionClips(prev => [...prev, clip]);
      
      console.log(`📹 Question ${currentQuestion.id} clip saved`);
      console.log(`📹 Clip size: ${blob.size} bytes`);
    };

    recorder.start();
    setMediaRecorder(recorder);
    setIsRecording(true);
    
    if (!startTime) {
      setStartTime(new Date());
    }
    
    console.log('🔴 Recording started for question:', currentQuestion.text);
    toast.info(`Recording started for Question ${currentQuestionIndex + 1}`);
  }, [stream, currentQuestion, currentQuestionIndex, startTime]);

  const stopCurrentRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }, [mediaRecorder]);

  const captureSnapshot = useCallback(() => {
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
          timestamp: new Date()
        };
        
        setSnapshots(prev => [...prev, snapshotData]);
        
        setShowFlash(true);
        setTimeout(() => setShowFlash(false), 200);
        
        console.log(`📸 Snapshot captured for Question ${currentQuestion.id}`);
        console.log(`📸 Image size: ${imageData.length} characters`);
        
        toast.success('Snapshot captured!');
        return snapshotData;
      }
    }
    return null;
  }, [currentQuestion]);

  const startCountdown = useCallback(() => {
    setShowCountdown(true);
    setCountdownValue(5);
    
    const countdownInterval = setInterval(() => {
      setCountdownValue(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setShowCountdown(false);
          captureSnapshot();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
  }, [captureSnapshot]);

  const handleNextQuestion = () => {
    stopCurrentRecording();
    
    if (currentQuestionIndex < KYC_QUESTIONS.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setIsRecording(false);
      setMediaRecorder(null);
      toast.success(`Question ${currentQuestionIndex + 1} completed`);
    } else {
      completeVerification();
    }
  };

  const completeVerification = () => {
    setIsRecording(false);
    const completionTime = new Date();
    setEndTime(completionTime);
    setIsComplete(true);
    
    // Log all collected data
    console.log('✅ KYC VERIFICATION COMPLETE');
    console.log('====================================');
    console.log('⏰ Start Time:', startTime?.toLocaleString());
    console.log('⏰ End Time:', completionTime.toLocaleString());
    console.log('⏱️ Total Duration:', formatTime(elapsedTime));
    console.log('====================================');
    console.log('📊 Total Questions:', KYC_QUESTIONS.length);
    console.log('📹 Video Clips:', questionClips.length + 1);
    console.log('📸 Snapshots:', snapshots.length);
    console.log('====================================');
    
    // Log video clips folder
    console.log('📁 VIDEO CLIPS FOLDER:');
    [...questionClips].forEach((clip, idx) => {
      console.log(`  📹 clip_question_${clip.questionId}.webm - ${clip.videoBlob.size} bytes`);
    });
    
    // Log snapshots folder
    console.log('📁 SNAPSHOTS FOLDER:');
    snapshots.forEach((snap, idx) => {
      console.log(`  📸 snapshot_question_${snap.questionId}.jpg - captured at ${snap.timestamp.toLocaleTimeString()}`);
    });
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
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 py-4 sm:py-6 md:py-8">
        {/* Header with Progress and Timer */}
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

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          {/* Video Feed */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden relative">
              {showFlash && (
                <div className="absolute inset-0 bg-snapshot-flash z-50 animate-pulse pointer-events-none" />
              )}
              
              {/* Countdown Overlay */}
              {showCountdown && (
                <div className="absolute inset-0 bg-background/80 z-40 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="text-7xl sm:text-9xl font-bold text-primary animate-pulse">
                      {countdownValue}
                    </div>
                    <p className="text-lg sm:text-xl text-foreground font-medium">Get Ready!</p>
                    <p className="text-sm text-muted-foreground">Snapshot will be captured</p>
                  </div>
                </div>
              )}
              
              <div className="relative aspect-video bg-muted">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover mirror"
                  style={{ transform: 'scaleX(-1)' }}
                />
                {isRecording && (
                  <div className="absolute top-2 sm:top-4 right-2 sm:right-4 flex items-center gap-1.5 sm:gap-2 bg-destructive/90 text-destructive-foreground px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full shadow-recording animate-pulse">
                    <Circle className="h-2 w-2 sm:h-3 sm:w-3 fill-current" />
                    <span className="text-xs sm:text-sm font-medium">Recording</span>
                  </div>
                )}
                
                {/* Timer overlay on video */}
                {isRecording && (
                  <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 flex items-center gap-1.5 bg-background/80 text-foreground px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg">
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                    <span className="text-xs sm:text-sm font-mono font-medium">{formatTime(elapsedTime)}</span>
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </Card>
          </div>

          {/* Question Panel */}
          <div className="space-y-3 sm:space-y-4 md:space-y-6">
            <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-5 md:space-y-6">
              <div className="space-y-3 sm:space-y-4">
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
              </div>

              <div className="space-y-2 sm:space-y-3">
                {!isRecording ? (
                  <Button
                    onClick={startQuestionRecording}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-10 sm:h-11 text-sm sm:text-base"
                  >
                    <Circle className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    Start Recording Answer
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={startCountdown}
                      variant="outline"
                      disabled={showCountdown}
                      className="w-full h-10 sm:h-11 text-sm sm:text-base border-accent text-accent hover:bg-accent hover:text-accent-foreground"
                    >
                      <Image className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                      {showCountdown ? `Capturing in ${countdownValue}...` : 'Capture Snapshot (5s)'}
                    </Button>
                    <Button
                      onClick={handleNextQuestion}
                      className="w-full bg-accent hover:bg-accent/90 text-accent-foreground h-10 sm:h-11 text-sm sm:text-base"
                    >
                      {currentQuestionIndex < KYC_QUESTIONS.length - 1 ? (
                        <>Next Question</>
                      ) : (
                        <>Complete Verification</>
                      )}
                    </Button>
                  </>
                )}
              </div>

              {isRecording && (
                <div className="text-xs sm:text-sm text-muted-foreground text-center animate-pulse">
                  Speak clearly into your microphone
                </div>
              )}
            </Card>

            {/* Progress Indicators */}
            <Card className="p-3 sm:p-4">
              <h4 className="text-xs sm:text-sm font-medium text-foreground mb-2 sm:mb-3">Questions Progress</h4>
              <div className="space-y-1.5 sm:space-y-2">
                {KYC_QUESTIONS.map((q, idx) => (
                  <div key={q.id} className="flex items-center gap-1.5 sm:gap-2">
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
                      Question {idx + 1}
                    </span>
                    {questionClips.some(c => c.questionId === q.id) && (
                      <span className="text-xs text-primary ml-auto">📹</span>
                    )}
                    {snapshots.some(s => s.questionId === q.id) && (
                      <span className="text-xs text-accent">📸</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

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

              {/* Video Clips Section */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Video className="h-5 w-5 text-primary" />
                  Video Clips ({questionClips.length})
                </h3>
                {questionClips.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No video clips recorded yet</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {questionClips.map((clip) => (
                      <Card key={clip.questionId} className="overflow-hidden">
                        <div className="aspect-video bg-muted relative group cursor-pointer"
                             onClick={() => setPreviewItem({ type: 'video', url: clip.videoUrl, title: `Question ${clip.questionId} Clip` })}>
                          <video src={clip.videoUrl} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-background/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="h-12 w-12 text-primary" />
                          </div>
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="font-medium text-foreground text-sm">Question {clip.questionId}</p>
                          <p className="text-xs text-muted-foreground truncate">{clip.questionText}</p>
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
                    {snapshots.map((snap) => (
                      <Card key={`${snap.questionId}-${snap.timestamp.getTime()}`} className="overflow-hidden">
                        <div className="aspect-square bg-muted relative group cursor-pointer"
                             onClick={() => setPreviewItem({ type: 'image', url: snap.imageData, title: `Question ${snap.questionId} Snapshot` })}>
                          <img src={snap.imageData} alt={`Snapshot Q${snap.questionId}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-background/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <ImageIcon className="h-10 w-10 text-accent" />
                          </div>
                        </div>
                        <div className="p-2 space-y-1">
                          <p className="font-medium text-foreground text-xs">Q{snap.questionId}</p>
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
              <p>📹 Video Clips: {questionClips.length}</p>
              <p>📸 Snapshots: {snapshots.length}</p>
              <p>🔴 Recording: {isRecording ? 'Active' : 'Inactive'}</p>
              <p>⏱️ Elapsed: {formatTime(elapsedTime)}</p>
              <p className="text-xs opacity-50 mt-2">Check browser console for detailed logs</p>
            </div>
          </details>
        </Card>
      </div>
    </div>
  );
}