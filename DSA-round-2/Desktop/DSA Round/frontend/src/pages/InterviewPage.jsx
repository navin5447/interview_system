import { useState, useEffect, useCallback, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as mpFaceDetection from '@mediapipe/face_detection';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getInterviewStatus,
  getInterviewQuestions,
  runCode,
  submitCode,
  completeInterview
} from '../services/api';
import { useTimer } from '../hooks/useTimer';
import { useTabDetection } from '../hooks/useTabDetection';
import CodeEditor from '../components/CodeEditor';
import QuestionPanel from '../components/QuestionPanel';
import OutputConsole from '../components/OutputConsole';
import Timer from '../components/Timer';
import ProgressTracker from '../components/ProgressTracker';
import {
  AlertTriangle,
  Send,
  Play,
  ChevronLeft,
  ChevronRight,
  Flag
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';

const DEFAULT_PROXY_SCORE = 100;
const ROUND_PROXY_PENALTIES = {
  mcq: { tab_hidden: 12, window_blur: 8, fullscreen_exit: 15, phone_detected: 25, multiple_faces: 20, no_face: 10 },
  aptitude: { tab_hidden: 8, window_blur: 6, fullscreen_exit: 10, phone_detected: 20, multiple_faces: 15, no_face: 8 },
  coding: { tab_hidden: 10, window_blur: 6, fullscreen_exit: 12, phone_detected: 22, multiple_faces: 18, no_face: 8 },
  technical: { tab_hidden: 12, window_blur: 8, fullscreen_exit: 15, phone_detected: 25, multiple_faces: 20, no_face: 10 }
};

function InterviewPage() {
  const { interviewId } = useParams();
  const navigate = useNavigate();

  // State
  const [interview, setInterview] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [code, setCode] = useState({});
  const [language, setLanguage] = useState('python');
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [submittedQuestions, setSubmittedQuestions] = useState(new Set());
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [proxyScore, setProxyScore] = useState(DEFAULT_PROXY_SCORE);
  const [proxyEvents, setProxyEvents] = useState([]);
  const [proxyRoundType, setProxyRoundType] = useState('coding');
  const [proxySecurityApproved, setProxySecurityApproved] = useState(false);
  const [proxySecurityError, setProxySecurityError] = useState('');
  const proxyVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const objectDetectorRef = useRef(null);
  const faceDetectorRef = useRef(null);
  const modelsReadyRef = useRef(false);
  const visionIntervalRef = useRef(null);
  const visionInFlightRef = useRef(false);
  const noFaceStreakRef = useRef(0);
  const violationCooldownRef = useRef({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = (params.get('proxy_round') || 'coding').toLowerCase();
    setProxyRoundType(fromQuery);
  }, []);

  const registerProxyViolation = useCallback((type, cooldownMs = 4000) => {
    const now = Date.now();
    const lastAt = violationCooldownRef.current[type] || 0;
    if (now - lastAt < cooldownMs) {
      return;
    }

    violationCooldownRef.current[type] = now;
    const penalties = ROUND_PROXY_PENALTIES[proxyRoundType] || ROUND_PROXY_PENALTIES.coding;
    const penalty = penalties[type] || 0;
    setProxyScore((prev) => Math.max(0, prev - penalty));
    setProxyEvents((prev) => ([
      ...prev,
      { type, penalty, round: proxyRoundType, timestamp: Date.now() }
    ]));
  }, [proxyRoundType]);

  const ensureVisionModels = useCallback(async () => {
    if (modelsReadyRef.current) {
      return true;
    }

    try {
      await tf.ready();

      objectDetectorRef.current = await cocoSsd.load({
        base: 'mobilenet_v2'
      });

      const FaceDetectionCtor = mpFaceDetection.FaceDetection || window.FaceDetection;
      if (!FaceDetectionCtor) {
        return false;
      }

      const faceDetector = new FaceDetectionCtor({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
      });
      faceDetector.setOptions({ modelSelection: 0, minDetectionConfidence: 0.5 });
      faceDetectorRef.current = faceDetector;
      modelsReadyRef.current = true;
      return true;
    } catch (error) {
      console.error('Failed to load proctoring models:', error);
      return false;
    }
  }, []);

  const startProxyCamera = useCallback(async () => {
    if (mediaStreamRef.current) {
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (proxyVideoRef.current) {
        proxyVideoRef.current.srcObject = stream;
        proxyVideoRef.current.play().catch(() => {});
      }
      return true;
    } catch (error) {
      console.error('Proctoring camera permission failed:', error);
      return false;
    }
  }, []);

  const stopProxyCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (proxyVideoRef.current) {
      proxyVideoRef.current.srcObject = null;
    }
  }, []);

  const detectPhone = useCallback(async () => {
    if (!objectDetectorRef.current || !proxyVideoRef.current) {
      return false;
    }

    const predictions = await objectDetectorRef.current.detect(proxyVideoRef.current);
    return predictions.some((item) => item.class === 'cell phone' && item.score >= 0.5);
  }, []);

  const detectFaceCount = useCallback(async () => {
    if (!faceDetectorRef.current || !proxyVideoRef.current) {
      return 0;
    }

    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(0), 1200);
      faceDetectorRef.current.onResults((result) => {
        window.clearTimeout(timer);
        const count = Array.isArray(result?.detections) ? result.detections.length : 0;
        resolve(count);
      });
      faceDetectorRef.current.send({ image: proxyVideoRef.current }).catch(() => {
        window.clearTimeout(timer);
        resolve(0);
      });
    });
  }, []);

  const approveProxySecurity = useCallback(async () => {
    setProxySecurityError('');

    const mediaOk = await startProxyCamera();
    if (!mediaOk) {
      setProxySecurityError('Camera and microphone permission is required to continue.');
      return;
    }

    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (_error) {
      setProxySecurityError('Fullscreen permission is required to continue.');
      return;
    }

    const modelsOk = await ensureVisionModels();
    if (!modelsOk) {
      setProxySecurityError('AI proctoring models failed to load. Please check connection and retry.');
      return;
    }

    setProxySecurityApproved(true);
  }, [ensureVisionModels, startProxyCamera]);

  // Hooks
  const { tabSwitchCount } = useTabDetection((count) => {
    if (!proxySecurityApproved) {
      return;
    }
    setWarningMessage(`Warning: Tab switch detected (${count} times). Excessive switching may be flagged.`);
    setShowWarning(true);
    setTimeout(() => setShowWarning(false), 5000);
    registerProxyViolation('tab_hidden');
  });

  useEffect(() => {
    if (!proxySecurityApproved) {
      return undefined;
    }

    const runVisionChecks = async () => {
      if (!modelsReadyRef.current || !proxyVideoRef.current || proxyVideoRef.current.readyState < 2 || visionInFlightRef.current) {
        return;
      }

      visionInFlightRef.current = true;
      try {
        const [phoneDetected, faceCount] = await Promise.all([detectPhone(), detectFaceCount()]);

        if (phoneDetected) {
          setWarningMessage('Warning: Phone detected during coding round.');
          setShowWarning(true);
          setTimeout(() => setShowWarning(false), 5000);
          registerProxyViolation('phone_detected', 9000);
        }

        if (faceCount > 1) {
          setWarningMessage('Warning: Multiple faces detected.');
          setShowWarning(true);
          setTimeout(() => setShowWarning(false), 5000);
          noFaceStreakRef.current = 0;
          registerProxyViolation('multiple_faces', 9000);
        } else if (faceCount === 0) {
          noFaceStreakRef.current += 1;
          if (noFaceStreakRef.current >= 2) {
            setWarningMessage('Warning: Candidate face not visible.');
            setShowWarning(true);
            setTimeout(() => setShowWarning(false), 5000);
            registerProxyViolation('no_face', 9000);
            noFaceStreakRef.current = 0;
          }
        } else {
          noFaceStreakRef.current = 0;
        }
      } catch (error) {
        console.error('Vision checks failed:', error);
      } finally {
        visionInFlightRef.current = false;
      }
    };

    const onWindowBlur = () => {
      registerProxyViolation('window_blur');
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        registerProxyViolation('fullscreen_exit');
      }
    };

    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    visionIntervalRef.current = window.setInterval(() => {
      runVisionChecks();
    }, 2500);

    return () => {
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (visionIntervalRef.current) {
        window.clearInterval(visionIntervalRef.current);
        visionIntervalRef.current = null;
      }
      visionInFlightRef.current = false;
      noFaceStreakRef.current = 0;
    };
  }, [detectFaceCount, detectPhone, proxySecurityApproved, registerProxyViolation]);

  useEffect(() => {
    return () => {
      stopProxyCamera();
    };
  }, [stopProxyCamera]);

  useEffect(() => {
    const payload = {
      score: proxyScore,
      events: proxyEvents,
      interviewId
    };
    sessionStorage.setItem('smartrecruit_proxy_payload', JSON.stringify(payload));
  }, [proxyScore, proxyEvents, interviewId]);

  const handleTimeExpire = useCallback(async () => {
    try {
      await completeInterview(interviewId);
      navigate(`/results/${interviewId}`);
    } catch (err) {
      console.error('Failed to complete interview:', err);
      navigate(`/results/${interviewId}`);
    }
  }, [interviewId, navigate]);

  const { formattedTime, isWarning, isCritical, isExpired } = useTimer(
    interview?.end_time,
    handleTimeExpire
  );

  // Load interview data
  useEffect(() => {
    loadInterviewData();
  }, [interviewId]);

  const loadInterviewData = async () => {
    try {
      const [statusData, questionsData] = await Promise.all([
        getInterviewStatus(interviewId),
        getInterviewQuestions(interviewId)
      ]);

      console.log('Interview Status:', statusData);
      console.log('Questions Data:', questionsData);

      if (statusData.status === 'completed' || statusData.status === 'expired') {
        console.warn('Interview already completed/expired, redirecting to results');
        navigate(`/results/${interviewId}`);
        return;
      }

      setInterview(statusData);
      setQuestions(questionsData);

      // Initialize code for each question
      const initialCode = {};
      questionsData.forEach((q) => {
        initialCode[q.id] = q.boilerplate_code?.python || '';
      });
      setCode(initialCode);

      setLoading(false);
    } catch (err) {
      console.error('Failed to load interview:', err);
      console.error('Error details:', err.response?.data || err.message);
      navigate('/');
    }
  };

  const currentQuestion = questions[currentIndex];

  const handleCodeChange = (newCode) => {
    if (currentQuestion) {
      setCode((prev) => ({
        ...prev,
        [currentQuestion.id]: newCode
      }));
    }
  };

  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
    // Update code template if question has boilerplate
    if (currentQuestion?.boilerplate_code?.[newLanguage]) {
      // Only update if current code is empty or is a boilerplate
      const currentCode = code[currentQuestion.id] || '';
      const oldBoilerplate = currentQuestion.boilerplate_code?.[language] || '';
      if (!currentCode || currentCode === oldBoilerplate) {
        setCode((prev) => ({
          ...prev,
          [currentQuestion.id]: currentQuestion.boilerplate_code[newLanguage]
        }));
      }
    }
  };

  const handleRunCode = async () => {
    if (!currentQuestion) return;

    setExecuting(true);
    setOutput({ status: 'running', message: 'Running code...' });

    try {
      const result = await runCode({
        interview_id: interviewId,
        question_id: currentQuestion.id,
        code: code[currentQuestion.id] || '',
        language
      });

      setOutput({
        status: 'completed',
        type: 'run',
        results: result.results,
        passed: result.passed,
        total: result.total
      });
    } catch (err) {
      setOutput({
        status: 'error',
        message: err.response?.data?.detail || 'Failed to run code'
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleSubmitCode = async () => {
    if (!currentQuestion) return;

    setExecuting(true);
    setOutput({ status: 'running', message: 'Submitting code...' });

    try {
      const result = await submitCode({
        interview_id: interviewId,
        question_id: currentQuestion.id,
        code: code[currentQuestion.id] || '',
        language
      });

      setOutput({
        status: 'completed',
        type: 'submit',
        results: result.results,
        passed: result.passed,
        total: result.total,
        score: result.score
      });

      setSubmittedQuestions((prev) => new Set([...prev, currentQuestion.id]));
    } catch (err) {
      setOutput({
        status: 'error',
        message: err.response?.data?.detail || 'Failed to submit code'
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleFinishInterview = async () => {
    if (window.confirm('Are you sure you want to finish the interview? You cannot make changes after this.')) {
      try {
        await completeInterview(interviewId);
        navigate(`/results/${interviewId}`);
      } catch (err) {
        console.error('Failed to complete interview:', err);
        navigate(`/results/${interviewId}`);
      }
    }
  };

  const goToQuestion = (index) => {
    if (index >= 0 && index < questions.length) {
      setCurrentIndex(index);
      setOutput(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surfaceMuted">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading interview...</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      title="Live Coding Round"
      subtitle="Solve DSA problems while we quietly track integrity and progress."
      actions={
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {tabSwitchCount > 0 && (
            <span className="flex items-center gap-1 text-orange-600">
              <AlertTriangle className="w-3 h-3" />
              Switches: {tabSwitchCount}
            </span>
          )}
          <span className="text-purple-700 font-semibold">Proxy: {proxyScore}</span>
          <Timer time={formattedTime} isWarning={isWarning} isCritical={isCritical} />
          <Button variant="danger" onClick={handleFinishInterview} className="px-3 py-1 text-xs">
            <Flag className="w-3 h-3" />
            Finish
          </Button>
        </div>
      }
    >
      <video ref={proxyVideoRef} className="hidden" autoPlay playsInline muted />

      {!proxySecurityApproved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-borderSubtle bg-surface p-6 shadow-[var(--shadow-hover)]">
            <h2 className="text-2xl font-semibold text-graphite">Security Check Required</h2>
            <ul className="mt-4 list-disc pl-5 text-sm text-gray-700 space-y-2">
              <li>Fullscreen mode is mandatory during this coding round.</li>
              <li>Camera/microphone access is required for proctoring checks.</li>
              <li>Tab switching, phone detection, and multiple-face events reduce proxy score.</li>
            </ul>
            {proxySecurityError && (
              <p className="mt-4 text-sm font-semibold text-rose-600">{proxySecurityError}</p>
            )}
            <div className="mt-6 flex justify-end">
              <Button variant="primary" onClick={approveProxySecurity} className="px-5 py-2 text-sm">
                I Agree, Start Secure Round
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="h-[calc(100vh-6rem)] flex flex-col rounded-2xl border border-borderSubtle bg-surface shadow-[var(--shadow-soft)] overflow-hidden">

      {showWarning && (
        <div className="bg-gradient-to-r from-amber-500 to-rose-500 text-white px-4 py-2 text-center text-xs sm:text-sm">
          {warningMessage}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-full md:w-2/5 border-r border-borderSubtle bg-surface overflow-y-auto">
          <QuestionPanel
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            totalQuestions={questions.length}
            isSubmitted={submittedQuestions.has(currentQuestion?.id)}
          />
        </div>

        <div className="hidden md:flex md:w-3/5 flex-col">
          <CodeEditor
            code={code[currentQuestion?.id] || ''}
            language={language}
            onChange={handleCodeChange}
            onLanguageChange={handleLanguageChange}
          />

          <div className="h-48 bg-gray-900 overflow-y-auto">
            <OutputConsole output={output} />
          </div>

          <div className="bg-surface border-t border-borderSubtle px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => goToQuestion(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="px-3 py-1 text-xs"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <Button
                variant="ghost"
                onClick={() => goToQuestion(currentIndex + 1)}
                disabled={currentIndex === questions.length - 1}
                className="px-3 py-1 text-xs"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleRunCode} disabled={executing} variant="soft" className="px-4 py-2 text-xs">
                <Play className="w-4 h-4" />
                Run Code
              </Button>
              <Button onClick={handleSubmitCode} disabled={executing} variant="primary" className="px-4 py-2 text-xs">
                <Send className="w-4 h-4" />
                Submit
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </AppShell>
  );
}

export default InterviewPage;
