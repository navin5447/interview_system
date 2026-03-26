import { CheckCircle, XCircle, Clock, AlertTriangle, Terminal } from 'lucide-react';

function OutputConsole({ output }) {
  if (!output) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="w-4 h-4" />
          <span>Output Console</span>
        </div>
        <p className="text-gray-600">Run your code to see output here...</p>
      </div>
    );
  }

  if (output.status === 'running') {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-blue-400">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
          <span>{output.message}</span>
        </div>
      </div>
    );
  }

  if (output.status === 'error') {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <XCircle className="w-5 h-5" />
          <span className="font-medium">Error</span>
        </div>
        <pre className="text-red-300 text-sm whitespace-pre-wrap">{output.message}</pre>
      </div>
    );
  }

  const getStatusIcon = (status, passed) => {
    if (passed) {
      return <CheckCircle className="w-4 h-4 text-green-400" />;
    }
    switch (status) {
      case 'Time Limit Exceeded':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'Compilation Error':
      case 'Runtime Error':
        return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      default:
        return <XCircle className="w-4 h-4 text-red-400" />;
    }
  };

  const getStatusColor = (status, passed) => {
    if (passed) return 'text-green-400';
    if (status === 'Time Limit Exceeded') return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="p-4">
      {/* Summary */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {output.passed === output.total ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <span className={output.passed === output.total ? 'text-green-400' : 'text-red-400'}>
              {output.passed === output.total ? 'All Tests Passed' : 'Some Tests Failed'}
            </span>
          </div>
          <span className="text-gray-400 text-sm">
            ({output.passed}/{output.total} passed)
          </span>
        </div>

        {output.type === 'submit' && output.score !== undefined && (
          <div className="text-sm">
            <span className="text-gray-400">Score: </span>
            <span className="text-green-400 font-medium">{output.score.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Test Case Results */}
      <div className="space-y-3 max-h-32 overflow-y-auto">
        {output.results?.map((result, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg ${result.passed ? 'bg-green-900/20 border border-green-800/50' : 'bg-red-900/20 border border-red-800/50'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {getStatusIcon(result.status, result.passed)}
                <span className={`font-medium ${getStatusColor(result.status, result.passed)}`}>
                  Test Case {result.test_case_num}
                </span>
              </div>
              <span className={`text-xs ${getStatusColor(result.status, result.passed)}`}>
                {result.status}
              </span>
            </div>

            {/* Show details for visible test cases */}
            {output.type === 'run' && (
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500">Input:</span>
                  <pre className="text-gray-300 mt-1 bg-gray-800 p-2 rounded overflow-x-auto">
                    {result.input}
                  </pre>
                </div>
                <div>
                  <span className="text-gray-500">
                    {result.passed ? 'Output:' : 'Expected vs Actual:'}
                  </span>
                  {result.passed ? (
                    <pre className="text-green-300 mt-1 bg-gray-800 p-2 rounded overflow-x-auto">
                      {result.actual_output || result.expected_output}
                    </pre>
                  ) : (
                    <div className="mt-1 space-y-1">
                      <pre className="text-gray-400 bg-gray-800 p-2 rounded overflow-x-auto">
                        Expected: {result.expected_output}
                      </pre>
                      <pre className="text-red-300 bg-gray-800 p-2 rounded overflow-x-auto">
                        Got: {result.actual_output || '(empty)'}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error message */}
            {result.error && (
              <pre className="mt-2 text-xs text-red-300 bg-red-900/30 p-2 rounded overflow-x-auto">
                {result.error}
              </pre>
            )}

            {/* Execution stats */}
            {(result.execution_time_ms || result.memory_used_kb) && (
              <div className="mt-2 text-xs text-gray-500 flex gap-4">
                {result.execution_time_ms && (
                  <span>Time: {result.execution_time_ms.toFixed(2)}ms</span>
                )}
                {result.memory_used_kb && (
                  <span>Memory: {(result.memory_used_kb / 1024).toFixed(2)}MB</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default OutputConsole;
