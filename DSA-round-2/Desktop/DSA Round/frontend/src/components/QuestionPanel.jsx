import { CheckCircle, FileText, Lightbulb } from 'lucide-react';

function QuestionPanel({ question, questionNumber, totalQuestions, isSubmitted }) {
  if (!question) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Loading question...</p>
      </div>
    );
  }

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'hard':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            Question {questionNumber} of {totalQuestions}
          </span>
          <span className={`px-2 py-1 rounded text-xs font-medium border ${getDifficultyColor(question.difficulty)}`}>
            {question.difficulty}
          </span>
          {isSubmitted && (
            <span className="flex items-center gap-1 text-green-600 text-sm">
              <CheckCircle className="w-4 h-4" />
              Submitted
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <h2 className="text-xl font-bold text-gray-800 mb-4">{question.title}</h2>

      {/* Description */}
      <div className="prose prose-sm max-w-none mb-6">
        <div className="text-gray-700 whitespace-pre-wrap">{question.description}</div>
      </div>

      {/* Input Format */}
      {question.input_format && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Input Format
          </h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 whitespace-pre-wrap">
            {question.input_format}
          </div>
        </div>
      )}

      {/* Output Format */}
      {question.output_format && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Output Format
          </h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 whitespace-pre-wrap">
            {question.output_format}
          </div>
        </div>
      )}

      {/* Constraints */}
      {question.constraints && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Constraints</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 font-mono whitespace-pre-wrap">
            {question.constraints}
          </div>
        </div>
      )}

      {/* Sample Test Cases */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Lightbulb className="w-4 h-4" />
          Sample Test Cases
        </h3>

        <div className="space-y-4">
          {question.visible_test_cases?.map((tc, index) => (
            <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600 border-b border-gray-200">
                Example {index + 1}
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-200">
                <div className="p-3">
                  <div className="text-xs text-gray-500 mb-1">Input:</div>
                  <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap bg-gray-50 p-2 rounded">
                    {tc.input}
                  </pre>
                </div>
                <div className="p-3">
                  <div className="text-xs text-gray-500 mb-1">Expected Output:</div>
                  <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap bg-gray-50 p-2 rounded">
                    {tc.output}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time and Memory Limits */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mt-6 pt-4 border-t border-gray-200">
        <span>Time Limit: {question.time_limit_ms}ms</span>
        <span>Memory Limit: {Math.round(question.memory_limit_kb / 1024)}MB</span>
      </div>
    </div>
  );
}

export default QuestionPanel;
