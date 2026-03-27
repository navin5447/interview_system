import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { startInterview, getAvailableCounts } from '../services/api';
import { Code2, Clock, Layers, ChevronRight, AlertCircle } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';

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
    <AppShell
      title="DSA Coding Interview"
      subtitle="Configure and launch an AI‑enhanced coding interview session."
      actions={
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Proctoring online
        </div>
      }
    >
      <motion.div
        className="max-w-3xl mx-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card>
          <div className="flex items-start gap-4 mb-6">
            <motion.div
              className="inline-flex items-center justify-center w-12 h-12 bg-primary-50 rounded-2xl"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 100, delay: 0.1 }}
            >
              <Code2 className="w-7 h-7 text-primary-600" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-lg font-semibold text-graphite">Configure interview session</h2>
              <p className="text-sm text-gray-600 mt-1">
                Choose question difficulty, duration, and let Agentica orchestrate a balanced DSA round.
              </p>
            </motion.div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-sm"
            >
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-red-700">{error}</span>
            </motion.div>
          )}

          <div className="space-y-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800 mb-3">
                <Layers className="w-4 h-4" />
                Question Distribution
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                  <label className="block text-xs font-semibold text-emerald-700 mb-2 tracking-wide uppercase">
                    Easy
                  </label>
                  <TextField
                    type="number"
                    min="0"
                    max={availableCounts?.easy || 10}
                    value={config.easy}
                    onChange={(e) => handleChange('easy', e.target.value)}
                    className="text-center text-lg font-semibold border-emerald-200 focus:border-emerald-500 focus:ring-emerald-200"
                  />
                  {availableCounts && (
                    <p className="text-xs text-emerald-700 mt-1 text-center">
                      Available: {availableCounts.easy}
                    </p>
                  )}
                </div>

                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                  <label className="block text-xs font-semibold text-amber-700 mb-2 tracking-wide uppercase">
                    Medium
                  </label>
                  <TextField
                    type="number"
                    min="0"
                    max={availableCounts?.medium || 10}
                    value={config.medium}
                    onChange={(e) => handleChange('medium', e.target.value)}
                    className="text-center text-lg font-semibold border-amber-200 focus:border-amber-500 focus:ring-amber-200"
                  />
                  {availableCounts && (
                    <p className="text-xs text-amber-700 mt-1 text-center">
                      Available: {availableCounts.medium}
                    </p>
                  )}
                </div>

                <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
                  <label className="block text-xs font-semibold text-rose-700 mb-2 tracking-wide uppercase">
                    Hard
                  </label>
                  <TextField
                    type="number"
                    min="0"
                    max={availableCounts?.hard || 10}
                    value={config.hard}
                    onChange={(e) => handleChange('hard', e.target.value)}
                    className="text-center text-lg font-semibold border-rose-200 focus:border-rose-500 focus:ring-rose-200"
                  />
                  {availableCounts && (
                    <p className="text-xs text-rose-700 mt-1 text-center">
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
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800 mb-3">
                <Clock className="w-4 h-4" />
                Duration (minutes)
              </label>
              <select
                value={config.duration}
                onChange={(e) => handleChange('duration', e.target.value)}
                className="w-full px-4 py-3 border border-borderSubtle rounded-xl bg-white/80 focus:ring-2 focus:ring-primary-300 focus:border-primary-500 text-sm"
              >
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes (1 hour)</option>
                <option value={90}>90 minutes (1.5 hours)</option>
                <option value={120}>120 minutes (2 hours)</option>
              </select>
            </div>

            <div className="bg-surfaceMuted rounded-2xl p-4 border border-borderSubtle/60">
              <h3 className="font-medium text-gray-800 mb-2">Scoring guide</h3>
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

            <Button
              onClick={handleStartInterview}
              disabled={loading || totalQuestions === 0}
              variant="primary"
              fullWidth
              className="py-3 text-sm"
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
            </Button>
          </div>
        </Card>
      </motion.div>
    </AppShell>
  );
}

export default SetupPage;
