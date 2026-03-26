import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getResults } from '../services/api';
import {
  Trophy,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  ArrowLeft,
  Download
} from 'lucide-react';

function ResultsPage() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncTriggered, setSyncTriggered] = useState(false);

  useEffect(() => {
    loadResults();
  }, [interviewId]);

  useEffect(() => {
    if (!results || syncTriggered) {
      return;
    }

    const submitUrl = sessionStorage.getItem('smartrecruit_submit_url') || '';
    if (!submitUrl) {
      return;
    }

    try {
      const callback = new URL(submitUrl);
      callback.searchParams.set('interview_id', interviewId);
      callback.searchParams.set('percentage', String(results.percentage ?? 0));
      callback.searchParams.set('total_score', String(results.total_score ?? 0));
      callback.searchParams.set('max_score', String(results.max_score ?? 0));
      callback.searchParams.set('verdict', String(results.final_verdict ?? ''));
      sessionStorage.removeItem('smartrecruit_submit_url');
      setSyncTriggered(true);
      window.location.href = callback.toString();
    } catch (err) {
      console.error('Failed to sync coding results to SmartRecruit:', err);
    }
  }, [results, interviewId, syncTriggered]);

  const loadResults = async () => {
    try {
      const data = await getResults(interviewId);
      setResults(data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load results');
      setLoading(false);
    }
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'hard':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getScoreColor = (score, maxScore) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const isPassed = results.final_verdict === 'Pass';

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Start New Interview
        </button>

        {/* Result Header */}
        <div className={`rounded-2xl p-8 mb-6 ${isPassed ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isPassed ? 'bg-green-100' : 'bg-red-100'}`}>
                {isPassed ? (
                  <Trophy className="w-8 h-8 text-green-600" />
                ) : (
                  <XCircle className="w-8 h-8 text-red-600" />
                )}
              </div>
              <div>
                <h1 className={`text-3xl font-bold ${isPassed ? 'text-green-800' : 'text-red-800'}`}>
                  {results.final_verdict}
                </h1>
                <p className={`${isPassed ? 'text-green-600' : 'text-red-600'}`}>
                  Interview Completed
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className={`text-4xl font-bold ${getScoreColor(results.total_score, results.max_score)}`}>
                {results.total_score} / {results.max_score}
              </div>
              <p className="text-gray-600 text-sm">Points Scored</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="w-5 h-5 text-primary-600" />
              <span className="text-gray-600 text-sm">Percentage</span>
            </div>
            <p className={`text-2xl font-bold ${getScoreColor(results.percentage, 100)}`}>
              {results.percentage.toFixed(1)}%
            </p>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-gray-600 text-sm">Questions Submitted</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {results.question_wise.filter(q => q.submitted).length} / {results.question_wise.length}
            </p>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <span className="text-gray-600 text-sm">Time Taken</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {results.time_taken_minutes || '--'} min
            </p>
          </div>
        </div>

        {/* Question-wise Results */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Question-wise Breakdown</h2>
          </div>

          <div className="divide-y divide-gray-100">
            {results.question_wise.map((question, index) => (
              <div key={question.question_id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-medium text-gray-500 w-8">
                      #{index + 1}
                    </span>
                    <div>
                      <h3 className="font-medium text-gray-800">{question.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDifficultyColor(question.difficulty)}`}>
                          {question.difficulty}
                        </span>
                        {!question.submitted && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            Not Submitted
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-4">
                      <div className="text-sm">
                        <span className="text-gray-500">Test Cases: </span>
                        <span className={`font-medium ${question.passed === question.total ? 'text-green-600' : 'text-orange-600'}`}>
                          {question.passed}/{question.total}
                        </span>
                      </div>

                      <div className="text-right min-w-[80px]">
                        <span className={`text-lg font-bold ${getScoreColor(question.score, question.max_score)}`}>
                          {question.score.toFixed(2)}
                        </span>
                        <span className="text-gray-400 text-sm"> / {question.max_score}</span>
                      </div>

                      {question.passed === question.total && question.submitted ? (
                        <CheckCircle className="w-6 h-6 text-green-500" />
                      ) : question.submitted ? (
                        <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
                          <span className="text-white text-xs font-bold">!</span>
                        </div>
                      ) : (
                        <XCircle className="w-6 h-6 text-gray-300" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                {question.submitted && (
                  <div className="mt-3 ml-12">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${question.passed === question.total ? 'bg-green-500' : 'bg-orange-500'}`}
                        style={{ width: `${(question.passed / question.total) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Scoring Legend */}
        <div className="mt-6 bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-medium text-gray-800 mb-3">Scoring System</h3>
          <div className="flex items-center gap-6 text-sm text-gray-600">
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 bg-green-500 rounded"></span>
              Easy: 1 point
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 bg-yellow-500 rounded"></span>
              Medium: 2 points
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 bg-red-500 rounded"></span>
              Hard: 3 points
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Score per question = (passed tests / total tests) × difficulty weight
          </p>
        </div>

        {/* Interview ID */}
        <div className="mt-6 text-center text-sm text-gray-500">
          Interview ID: {interviewId}
        </div>
      </div>
    </div>
  );
}

export default ResultsPage;
