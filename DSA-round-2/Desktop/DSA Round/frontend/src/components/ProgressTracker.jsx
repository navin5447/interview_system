import { CheckCircle } from 'lucide-react';

function ProgressTracker({ current, total, submittedQuestions, questions }) {
  const getDifficultyColor = (difficulty, isSubmitted) => {
    if (isSubmitted) {
      return 'bg-green-500 border-green-600';
    }

    switch (difficulty) {
      case 'easy':
        return 'bg-green-200 border-green-300';
      case 'medium':
        return 'bg-yellow-200 border-yellow-300';
      case 'hard':
        return 'bg-red-200 border-red-300';
      default:
        return 'bg-gray-200 border-gray-300';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600 mr-2">Progress:</span>
      <div className="flex items-center gap-1">
        {questions.map((question, index) => {
          const isSubmitted = submittedQuestions.has(question.id);
          const isCurrent = index === current - 1;

          return (
            <div
              key={question.id}
              className={`
                w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium
                ${getDifficultyColor(question.difficulty, isSubmitted)}
                ${isCurrent ? 'ring-2 ring-primary-500 ring-offset-1' : ''}
              `}
              title={`${question.title} (${question.difficulty})${isSubmitted ? ' - Submitted' : ''}`}
            >
              {isSubmitted ? (
                <CheckCircle className="w-4 h-4 text-white" />
              ) : (
                <span className={isSubmitted ? 'text-white' : 'text-gray-700'}>
                  {index + 1}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <span className="text-sm text-gray-500 ml-2">
        ({submittedQuestions.size}/{total} submitted)
      </span>
    </div>
  );
}

export default ProgressTracker;
