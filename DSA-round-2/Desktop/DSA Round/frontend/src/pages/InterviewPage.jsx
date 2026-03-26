import { useState, useEffect, useCallback } from 'react';
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

  // Hooks
  const { tabSwitchCount } = useTabDetection((count) => {
    setWarningMessage(`Warning: Tab switch detected (${count} times). Excessive switching may be flagged.`);
    setShowWarning(true);
    setTimeout(() => setShowWarning(false), 5000);
  });

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
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading interview...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-gray-800">DSA Interview</h1>
          <ProgressTracker
            current={currentIndex + 1}
            total={questions.length}
            submittedQuestions={submittedQuestions}
            questions={questions}
          />
        </div>

        <div className="flex items-center gap-4">
          {tabSwitchCount > 0 && (
            <span className="text-sm text-orange-600 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Switches: {tabSwitchCount}
            </span>
          )}

          <Timer
            time={formattedTime}
            isWarning={isWarning}
            isCritical={isCritical}
          />

          <button
            onClick={handleFinishInterview}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 text-sm font-medium"
          >
            <Flag className="w-4 h-4" />
            Finish
          </button>
        </div>
      </header>

      {/* Warning Banner */}
      {showWarning && (
        <div className="bg-orange-500 text-white px-4 py-2 text-center text-sm">
          {warningMessage}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Question Panel - Left Side */}
        <div className="w-2/5 border-r border-gray-200 bg-white overflow-y-auto">
          <QuestionPanel
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            totalQuestions={questions.length}
            isSubmitted={submittedQuestions.has(currentQuestion?.id)}
          />
        </div>

        {/* Code Editor - Right Side */}
        <div className="w-3/5 flex flex-col">
          <CodeEditor
            code={code[currentQuestion?.id] || ''}
            language={language}
            onChange={handleCodeChange}
            onLanguageChange={handleLanguageChange}
          />

          {/* Output Console */}
          <div className="h-48 bg-gray-900 overflow-y-auto">
            <OutputConsole output={output} />
          </div>

          {/* Action Buttons */}
          <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToQuestion(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => goToQuestion(currentIndex + 1)}
                disabled={currentIndex === questions.length - 1}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRunCode}
                disabled={executing}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Run Code
              </button>
              <button
                onClick={handleSubmitCode}
                disabled={executing}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Submit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InterviewPage;
