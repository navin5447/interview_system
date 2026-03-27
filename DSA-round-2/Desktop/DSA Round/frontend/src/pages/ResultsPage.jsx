import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getResults } from '../services/api';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { GradientProgress } from '../components/ui/GradientProgress';
import {
  Trophy,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  ArrowLeft,
  Zap,
  Target
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
      const proxyPayloadRaw = sessionStorage.getItem('smartrecruit_proxy_payload') || '';
      let proxyPayload = { score: 100, events: [] };
      if (proxyPayloadRaw) {
        try {
          proxyPayload = JSON.parse(proxyPayloadRaw);
        } catch {
          proxyPayload = { score: 100, events: [] };
        }
      }
      callback.searchParams.set('interview_id', interviewId);
      callback.searchParams.set('percentage', String(results.percentage ?? 0));
      callback.searchParams.set('total_score', String(results.total_score ?? 0));
      callback.searchParams.set('max_score', String(results.max_score ?? 0));
      callback.searchParams.set('verdict', String(results.final_verdict ?? ''));
      callback.searchParams.set('proxy_score', String(proxyPayload.score ?? 100));
      callback.searchParams.set('proxy_events', JSON.stringify(proxyPayload.events ?? []));
      sessionStorage.removeItem('smartrecruit_submit_url');
      sessionStorage.removeItem('smartrecruit_proxy_payload');
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surfaceMuted">
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-graphite text-sm font-medium">Loading interview results...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <motion.div
        className="min-h-screen flex items-center justify-center bg-surfaceMuted"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <Card className="text-center max-w-md">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <XCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
            <p className="text-graphite mb-6">{error}</p>
            <Button variant="primary" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </motion.div>
        </Card>
      </motion.div>
    );
  }

  const isPassed = results.final_verdict === 'Pass';
  const percentage = results.percentage || 0;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <AppShell
      title="Interview Results"
      subtitle="Your performance summary and detailed breakdown"
      actions={
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="px-3 py-1 text-xs flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          New Interview
        </Button>
      }
    >
      <motion.div
        className="max-w-5xl mx-auto space-y-6 pb-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Hero Result Card */}
        <motion.div variants={itemVariants}>
          <Card className={`px-8 py-12 border-2 ${
            isPassed
              ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-surface to-surface'
              : 'border-rose-200 bg-gradient-to-br from-rose-50 via-surface to-surface'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <motion.div
                  className={`w-20 h-20 rounded-2xl flex items-center justify-center ${
                    isPassed ? 'bg-emerald-100' : 'bg-rose-100'
                  }`}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 100, delay: 0.3 }}
                >
                  {isPassed ? (
                    <Trophy className={`w-10 h-10 ${isPassed ? 'text-emerald-600' : 'text-rose-600'}`} />
                  ) : (
                    <Target className={`w-10 h-10 ${isPassed ? 'text-emerald-600' : 'text-rose-600'}`} />
                  )}
                </motion.div>
                <div>
                  <h2 className={`text-4xl font-bold ${isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {results.final_verdict}
                  </h2>
                  <p className={`text-sm ${isPassed ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isPassed ? '🎉 Great performance!' : 'Keep practicing to improve!'}
                  </p>
                </div>
              </div>

              <motion.div
                className="text-right"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <div className={`text-5xl font-bold ${
                  isPassed ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {results.total_score}
                </div>
                <p className="text-graphite text-xs font-medium mt-1">
                  of {results.max_score} points
                </p>
              </motion.div>
            </div>
          </Card>
        </motion.div>

        {/* Key Metrics Grid */}
        <motion.div variants={itemVariants}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Percentage Card */}
            <Card>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-graphite text-sm font-medium">Success Rate</span>
                  <BarChart3 className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <div className="text-3xl font-bold text-primary-600">
                    {percentage.toFixed(1)}%
                  </div>
                  <div className="mt-3">
                    <GradientProgress value={percentage} />
                  </div>
                </div>
              </div>
            </Card>

            {/* Questions Submitted Card */}
            <Card>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-graphite text-sm font-medium">Submissions</span>
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-3xl font-bold text-graphite">
                    {results.question_wise.filter(q => q.submitted).length} / {results.question_wise.length}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {results.question_wise.filter(q => q.submitted).length === results.question_wise.length
                      ? 'All questions submitted'
                      : `${results.question_wise.length - results.question_wise.filter(q => q.submitted).length} pending`}
                  </p>
                </div>
              </div>
            </Card>

            {/* Time Taken Card */}
            <Card>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-graphite text-sm font-medium">Time Spent</span>
                  <Clock className="w-5 h-5 text-sky-600" />
                </div>
                <div>
                  <div className="text-3xl font-bold text-graphite">
                    {results.time_taken_minutes || '--'} <span className="text-lg">min</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {results.time_taken_minutes ? 'Interview duration' : 'Time data unavailable'}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </motion.div>

        {/* Question-wise Breakdown */}
        <motion.div variants={itemVariants}>
          <Card>
            <div className="space-y-1 pb-6 border-b border-borderSubtle">
              <h3 className="text-lg font-semibold text-graphite">Question-wise Breakdown</h3>
              <p className="text-xs text-gray-500">
                Detailed performance for each problem
              </p>
            </div>

            <div className="space-y-3 mt-6">
              {results.question_wise.map((question, index) => (
                <motion.div
                  key={question.question_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className="p-4 rounded-xl border border-borderSubtle hover:border-primary-200 hover:bg-surfaceMuted transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-primary-100 text-primary-600 font-semibold text-sm flex items-center justify-center">
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <h4 className="font-medium text-graphite">{question.title}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                              question.difficulty === 'easy'
                                ? 'bg-emerald-100 text-emerald-700'
                                : question.difficulty === 'medium'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}>
                              {question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}
                            </span>
                            {!question.submitted && (
                              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600">
                                Not Submitted
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {question.submitted && (
                        <div className="mt-3 ml-11">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-gray-500">
                              Passed: <span className="font-semibold text-graphite">{question.passed}/{question.total}</span> test cases
                            </span>
                          </div>
                          <GradientProgress value={(question.passed / question.total) * 100} />
                        </div>
                      )}
                    </div>

                    <div className="text-right flex items-center gap-3">
                      <div>
                        <div className={`text-lg font-bold ${
                          question.passed === question.total && question.submitted
                            ? 'text-emerald-600'
                            : question.submitted
                            ? 'text-amber-600'
                            : 'text-gray-400'
                        }`}>
                          {question.score.toFixed(1)}
                        </div>
                        <p className="text-xs text-gray-500">/ {question.max_score}</p>
                      </div>

                      {question.passed === question.total && question.submitted ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring' }}
                        >
                          <CheckCircle className="w-6 h-6 text-emerald-600" />
                        </motion.div>
                      ) : question.submitted ? (
                        <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
                          <Zap className="w-3 h-3 text-white" />
                        </div>
                      ) : (
                        <XCircle className="w-6 h-6 text-gray-300" />
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Scoring Explanation */}
        <motion.div variants={itemVariants}>
          <Card>
            <div className="space-y-4">
              <h3 className="font-semibold text-graphite flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary-600" />
                How Scoring Works
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { level: 'Easy', points: '1 point', color: 'bg-emerald-100 text-emerald-700' },
                  { level: 'Medium', points: '2 points', color: 'bg-amber-100 text-amber-700' },
                  { level: 'Hard', points: '3 points', color: 'bg-rose-100 text-rose-700' },
                ].map((item, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-surfaceMuted">
                    <p className="text-xs font-medium text-gray-600">{item.level}</p>
                    <p className={`text-sm font-bold mt-1 ${item.color.split(' ')[1]}`}>
                      {item.points}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 pt-2 border-t border-borderSubtle">
                Score = (passed test cases / total test cases) × difficulty weight
              </p>
            </div>
          </Card>
        </motion.div>

        {/* Footer */}
        <motion.div
          variants={itemVariants}
          className="text-center pt-4"
        >
          <p className="text-xs text-gray-500 mb-4">
            Interview ID: <span className="font-mono text-gray-600">{interviewId}</span>
          </p>
          <Button
            variant="primary"
            onClick={() => navigate('/')}
            className="px-6 py-3 text-sm"
          >
            <BarChart3 className="w-4 h-4" />
            Start New Interview
          </Button>
        </motion.div>
      </motion.div>
    </AppShell>
  );
}

export default ResultsPage;
