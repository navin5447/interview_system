// Default boilerplate templates for each language
export const codeTemplates = {
  python: `# Write your solution here
def solution():
    pass

# Read input and call your solution
`,
  cpp: `#include <iostream>
#include <vector>
#include <string>
using namespace std;

int main() {
    // Write your solution here

    return 0;
}
`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Write your solution here

    }
}
`,
  javascript: `// Write your solution here

// Read input from stdin
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let lines = [];
rl.on('line', (line) => {
    lines.push(line);
});

rl.on('close', () => {
    // Process input and solve

});
`
};

// Language display names
export const languageNames = {
  python: 'Python 3',
  cpp: 'C++ 17',
  java: 'Java 13',
  javascript: 'JavaScript'
};

// Monaco editor language IDs
export const monacoLanguages = {
  python: 'python',
  cpp: 'cpp',
  java: 'java',
  javascript: 'javascript'
};

// Get template for a question (use custom if available, else default)
export function getCodeTemplate(question, language) {
  if (question?.boilerplate_code?.[language]) {
    return question.boilerplate_code[language];
  }
  return codeTemplates[language] || codeTemplates.python;
}

export default codeTemplates;
