import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { startInterview, getAvailableCounts } from '../services/api';
import { Code2, Clock, Layers, ChevronRight, AlertCircle } from 'lucide-react';

function SetupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get initial values from URL params (for integration)
  const initialEasy = parseInt(searchParams.get('easy')) || 0;
  const initialMedium = parseInt(searchParams.get('medium')) || 0;
  const initialHard = parseInt(searchParams.get('hard')) || 0;
  const initialDuration = parseInt(searchParams.get('duration')) || 60;
  const candidateId = searchParams.get('candidate_id') || null;
  const submitUrl = searchParams.get('submit_url') || '';

  const [config, setConfig] = useState({
    easy: initialEasy,
    medium: initialMedium,
    hard: initialHard,
    duration: initialDuration
  });

  const [availableCounts, setAvailableCounts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAvailableCounts();

    if (submitUrl) {
      sessionStorage.setItem('smartrecruit_submit_url', submitUrl);
    }

    // Auto-start if all params provided via URL
    if (initialEasy + initialMedium + initialHard > 0) {
      handleStartInterview();
    }
  }, []);

  const fetchAvailableCounts = async () => {
    try {
      const counts = await getAvailableCounts();
      setAvailableCounts(counts);
    } catch (err) {
      console.error('Failed to fetch available counts:', err);
    }
  };

  const totalQuestions = config.easy + config.medium + config.hard;

  const handleChange = (field, value) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    setConfig(prev => ({ ...prev, [field]: numValue }));
    setError(null);
  };

  const handleStartInterview = async () => {
    if (totalQuestions === 0) {
      setError('Please select at least one question');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const requestData = {
        total_questions: totalQuestions,
        difficulty_distribution: {
          easy: config.easy,
          medium: config.medium,
          hard: config.hard
        },
        duration_minutes: config.duration,
        candidate_id: candidateId
      };

      console.log('Starting interview with:', requestData);
      const response = await startInterview(requestData);
      console.log('Interview created:', response);

      navigate(`/interview/${response.interview_id}`);
    } catch (err) {
      console.error('Failed to start interview:', err);
      console.error('Error details:', err.response?.data || err.message);
      setError(err.response?.data?.detail || 'Failed to start interview');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <Code2 className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">DSA Coding Interview</h1>
          <p className="text-gray-600 mt-2">Configure your interview session</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Layers className="w-4 h-4" />
              Question Distribution
            </label>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <label className="block text-sm font-medium text-green-800 mb-2">
                  Easy
                </label>
                <input
                  type="number"
                  min="0"
                  max={availableCounts?.easy || 10}
                  value={config.easy}
                  onChange={(e) => handleChange('easy', e.target.value)}
                  className="w-full px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-center text-lg font-semibold"
                />
                {availableCounts && (
                  <p className="text-xs text-green-600 mt-1 text-center">
                    Available: {availableCounts.easy}
                  </p>
                )}
              </div>

              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <label className="block text-sm font-medium text-yellow-800 mb-2">
                  Medium
                </label>
                <input
                  type="number"
                  min="0"
                  max={availableCounts?.medium || 10}
                  value={config.medium}
                  onChange={(e) => handleChange('medium', e.target.value)}
                  className="w-full px-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-center text-lg font-semibold"
                />
                {availableCounts && (
                  <p className="text-xs text-yellow-600 mt-1 text-center">
                    Available: {availableCounts.medium}
                  </p>
                )}
              </div>

              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <label className="block text-sm font-medium text-red-800 mb-2">
                  Hard
                </label>
                <input
                  type="number"
                  min="0"
                  max={availableCounts?.hard || 10}
                  value={config.hard}
                  onChange={(e) => handleChange('hard', e.target.value)}
                  className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-center text-lg font-semibold"
                />
                {availableCounts && (
                  <p className="text-xs text-red-600 mt-1 text-center">
                    Available: {availableCounts.hard}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 text-center">
              <span className="text-sm text-gray-600">Total Questions: </span>
              <span className="font-bold text-primary-600">{totalQuestions}</span>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Clock className="w-4 h-4" />
              Duration (minutes)
            </label>
            <select
              value={config.duration}
              onChange={(e) => handleChange('duration', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes (1 hour)</option>
              <option value={90}>90 minutes (1.5 hours)</option>
              <option value={120}>120 minutes (2 hours)</option>
            </select>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-800 mb-2">Scoring Guide</h3>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                Easy: 1 point
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                Medium: 2 points
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                Hard: 3 points
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Max possible score: {config.easy * 1 + config.medium * 2 + config.hard * 3} points
            </p>
          </div>

          <button
            onClick={handleStartInterview}
            disabled={loading || totalQuestions === 0}
            className="w-full py-4 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Starting...
              </>
            ) : (
              <>
                Start Interview
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SetupPage;
