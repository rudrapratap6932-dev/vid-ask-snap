import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Camera, Circle, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Question {
  id: number;
  text: string;
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
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [showFlash, setShowFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const currentQuestion = KYC_QUESTIONS[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / KYC_QUESTIONS.length) * 100;

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Ensure video plays after stream is set
        await videoRef.current.play().catch(err => {
          console.error('Error playing video:', err);
        });
      }

      const recorder = new MediaRecorder(mediaStream, {
        mimeType: 'video/webm;codecs=vp8,opus'
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        setRecordedChunks(chunks);
        console.log('📹 Recording stopped. Total chunks:', chunks.length);
        console.log('📹 Total video size:', chunks.reduce((acc, chunk) => acc + chunk.size, 0), 'bytes');
      };

      setMediaRecorder(recorder);
      setIsStarted(true);
      
      toast.success('Camera connected successfully');
    } catch (error) {
      console.error('❌ Camera access error:', error);
      toast.error('Failed to access camera. Please grant camera permissions.');
    }
  };

  const startRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'inactive') {
      mediaRecorder.start();
      setIsRecording(true);
      console.log('🔴 Recording started for question:', currentQuestion.text);
      toast.info('Recording started');
    }
  };

  const captureSnapshot = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const snapshot = canvas.toDataURL('image/jpeg', 0.95);
        
        setSnapshots(prev => [...prev, snapshot]);
        
        // Flash effect
        setShowFlash(true);
        setTimeout(() => setShowFlash(false), 200);
        
        console.log('📸 Snapshot captured for question', currentQuestionIndex + 1);
        console.log('📸 Snapshot data (first 100 chars):', snapshot.substring(0, 100));
        
        return snapshot;
      }
    }
    return null;
  };

  const handleNextQuestion = () => {
    // Capture snapshot for current question
    const snapshot = captureSnapshot();
    
    if (currentQuestionIndex < KYC_QUESTIONS.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      toast.success(`Question ${currentQuestionIndex + 1} completed`);
    } else {
      // Last question - complete the flow
      completeVerification();
    }
  };

  const completeVerification = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    
    setIsRecording(false);
    setIsComplete(true);
    
    // Log all collected data
    console.log('✅ KYC VERIFICATION COMPLETE');
    console.log('====================================');
    console.log('📊 Total Questions:', KYC_QUESTIONS.length);
    console.log('📸 Total Snapshots:', snapshots.length + 1); // +1 for the last one
    console.log('📹 Video Chunks:', recordedChunks.length);
    console.log('====================================');
    console.log('📸 All Snapshots:', [...snapshots]);
    console.log('====================================');
    
    toast.success('Verification completed successfully!');
  };

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-6">
              <CheckCircle2 className="h-16 w-16 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-foreground">Verification Complete!</h2>
            <p className="text-muted-foreground text-lg">
              Your KYC verification has been successfully recorded.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="space-y-1">
              <p className="text-3xl font-bold text-primary">{KYC_QUESTIONS.length}</p>
              <p className="text-sm text-muted-foreground">Questions Answered</p>
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-bold text-accent">{snapshots.length + 1}</p>
              <p className="text-sm text-muted-foreground">Snapshots Captured</p>
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-bold text-secondary-foreground">1</p>
              <p className="text-sm text-muted-foreground">Video Recorded</p>
            </div>
          </div>
          <div className="pt-4">
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
              className="w-full"
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full p-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-trust-gradient p-6">
                <Camera className="h-12 w-12 text-primary-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-foreground">KYC Verification</h1>
              <p className="text-muted-foreground text-lg">
                Complete your identity verification in minutes
              </p>
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-6">
            <h3 className="font-semibold text-foreground">What you'll need:</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground">A device with camera and microphone</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground">A quiet, well-lit environment</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground">5 minutes to answer verification questions</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3 pt-4">
            <Button 
              onClick={startCamera} 
              className="w-full bg-trust-gradient hover:opacity-90 text-primary-foreground text-lg h-14"
            >
              <Camera className="mr-2 h-5 w-5" />
              Start Verification
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              By continuing, you agree to be recorded for verification purposes
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6 py-8">
        {/* Header with Progress */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-foreground">Identity Verification</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-primary">
                Question {currentQuestionIndex + 1} of {KYC_QUESTIONS.length}
              </span>
            </div>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Video Feed */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden relative">
              {showFlash && (
                <div className="absolute inset-0 bg-snapshot-flash z-50 animate-pulse pointer-events-none" />
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
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-full shadow-recording animate-pulse">
                    <Circle className="h-3 w-3 fill-current" />
                    <span className="text-sm font-medium">Recording</span>
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </Card>
          </div>

          {/* Question Panel */}
          <div className="space-y-6">
            <Card className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <h3 className="font-semibold text-foreground">Current Question</h3>
                    <p className="text-lg text-foreground leading-relaxed">
                      {currentQuestion.text}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {!isRecording ? (
                  <Button
                    onClick={startRecording}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <Circle className="mr-2 h-4 w-4" />
                    Start Recording Answer
                  </Button>
                ) : (
                  <Button
                    onClick={handleNextQuestion}
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                  >
                    {currentQuestionIndex < KYC_QUESTIONS.length - 1 ? (
                      <>Next Question</>
                    ) : (
                      <>Complete Verification</>
                    )}
                  </Button>
                )}
              </div>

              {isRecording && (
                <div className="text-sm text-muted-foreground text-center animate-pulse">
                  Speak clearly into your microphone
                </div>
              )}
            </Card>

            {/* Progress Indicators */}
            <Card className="p-4">
              <h4 className="text-sm font-medium text-foreground mb-3">Questions Progress</h4>
              <div className="space-y-2">
                {KYC_QUESTIONS.map((q, idx) => (
                  <div key={q.id} className="flex items-center gap-2">
                    {idx < currentQuestionIndex ? (
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                    ) : idx === currentQuestionIndex ? (
                      <Circle className="h-4 w-4 text-accent flex-shrink-0 fill-current" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
                    )}
                    <span className={`text-sm ${
                      idx <= currentQuestionIndex 
                        ? 'text-foreground font-medium' 
                        : 'text-muted-foreground'
                    }`}>
                      Question {idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Debug Info */}
        <Card className="p-4 bg-muted/50">
          <details className="cursor-pointer">
            <summary className="text-sm font-medium text-foreground mb-2">
              Developer Console (Click to expand)
            </summary>
            <div className="text-xs text-muted-foreground space-y-1 font-mono">
              <p>📊 Current Question: {currentQuestionIndex + 1}/{KYC_QUESTIONS.length}</p>
              <p>📸 Snapshots Captured: {snapshots.length}</p>
              <p>🔴 Recording Status: {isRecording ? 'Active' : 'Inactive'}</p>
              <p>📹 Video Chunks: {recordedChunks.length}</p>
              <p className="text-xs opacity-50 mt-2">Check browser console for detailed logs</p>
            </div>
          </details>
        </Card>
      </div>
    </div>
  );
}
