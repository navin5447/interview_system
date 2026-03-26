import Editor from '@monaco-editor/react';
import { languageNames, monacoLanguages } from '../utils/codeTemplates';

function CodeEditor({ code, language, onChange, onLanguageChange }) {
  const handleEditorChange = (value) => {
    onChange(value || '');
  };

  // Block copy-paste (optional - can be toggled)
  const handleEditorMount = (editor, monaco) => {
    // Disable context menu (right-click)
    editor.onContextMenu((e) => {
      e.event.preventDefault();
    });

    // Optional: Block paste
    // editor.onDidPaste(() => {
    //   // Can show warning or block
    // });
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Language Selector */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-4">
          <label className="text-gray-400 text-sm">Language:</label>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="bg-gray-700 text-white text-sm px-3 py-1 rounded border border-gray-600 focus:outline-none focus:border-primary-500"
          >
            {Object.entries(languageNames).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-gray-500 text-xs">
          Press Ctrl+S to save locally
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 editor-container">
        <Editor
          height="100%"
          language={monacoLanguages[language] || 'python'}
          theme="vs-dark"
          value={code}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          options={{
            fontSize: 14,
            fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            padding: { top: 10, bottom: 10 },
            folding: true,
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>
    </div>
  );
}

export default CodeEditor;
