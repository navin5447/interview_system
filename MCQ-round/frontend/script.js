/**
 * AI Interview Simulator - Frontend Logic
 * Handles state management, API calls, timer, and UI interactions
 */

// Configuration
const API_URL = 'http://localhost:8000';

// Application State
const state = {
    sessionId: null,
    questions: [],
    currentQuestionIndex: 0,
    answers: {},
    timerInterval: null,
    timeRemaining: 0,
    timerPerQuestion: 60,
    config: {
        numQuestions: 15,
        timer: 60,
        difficulty: { easy: 20, medium: 50, hard: 30 }
    }
};

// DOM Elements
const elements = {
    // Screens
    setupScreen: document.getElementById('setup-screen'),
    interviewScreen: document.getElementById('interview-screen'),
    resultsScreen: document.getElementById('results-screen'),
    loadingOverlay: document.getElementById('loading-overlay'),

    // Setup
    jobInput: document.getElementById('job-input'),
    numQuestions: document.getElementById('num-questions'),
    numQuestionsValue: document.getElementById('num-questions-value'),
    timerSelect: document.getElementById('timer-select'),
    easyPercent: document.getElementById('easy-percent'),
    easyValue: document.getElementById('easy-value'),
    mediumPercent: document.getElementById('medium-percent'),
    mediumValue: document.getElementById('medium-value'),
    hardPercent: document.getElementById('hard-percent'),
    hardValue: document.getElementById('hard-value'),
    diffWarning: document.getElementById('diff-warning'),
    startBtn: document.getElementById('start-btn'),
    validationMessage: document.getElementById('validation-message'),

    // Interview
    questionCounter: document.getElementById('question-counter'),
    progressFill: document.getElementById('progress-fill'),
    timerDisplay: document.getElementById('timer-display'),
    timerValue: document.getElementById('timer-value'),
    difficultyBadge: document.getElementById('difficulty-badge'),
    categoryBadge: document.getElementById('category-badge'),
    questionText: document.getElementById('question-text'),
    optionsContainer: document.getElementById('options-container'),
    nextBtn: document.getElementById('next-btn'),

    // Results
    scorePercentage: document.getElementById('score-percentage'),
    scoreText: document.getElementById('score-text'),
    easyScore: document.getElementById('easy-score'),
    mediumScore: document.getElementById('medium-score'),
    hardScore: document.getElementById('hard-score'),
    questionReviewContainer: document.getElementById('question-review-container'),
    retryBtn: document.getElementById('retry-btn'),
    newInterviewBtn: document.getElementById('new-interview-btn')
};

// Initialize application
function init() {
    setupEventListeners();
    updateConfigDisplay();
    validateInputs();
}

// Event Listeners
function setupEventListeners() {
    // Input validation
    elements.jobInput.addEventListener('input', validateInputs);

    // Settings sliders
    elements.numQuestions.addEventListener('input', () => {
        state.config.numQuestions = parseInt(elements.numQuestions.value);
        elements.numQuestionsValue.textContent = state.config.numQuestions;
    });

    elements.timerSelect.addEventListener('change', () => {
        state.config.timer = parseInt(elements.timerSelect.value);
    });

    // Difficulty sliders
    elements.easyPercent.addEventListener('input', updateDifficultySliders);
    elements.mediumPercent.addEventListener('input', updateDifficultySliders);
    elements.hardPercent.addEventListener('input', updateDifficultySliders);

    // Start button
    elements.startBtn.addEventListener('click', startInterview);

    // Next button
    elements.nextBtn.addEventListener('click', nextQuestion);

    // Results buttons
    elements.retryBtn.addEventListener('click', retryInterview);
    elements.newInterviewBtn.addEventListener('click', resetToSetup);
}

function updateDifficultySliders() {
    const easy = parseInt(elements.easyPercent.value);
    const medium = parseInt(elements.mediumPercent.value);
    const hard = parseInt(elements.hardPercent.value);

    elements.easyValue.textContent = easy + '%';
    elements.mediumValue.textContent = medium + '%';
    elements.hardValue.textContent = hard + '%';

    state.config.difficulty = { easy, medium, hard };

    // Show warning if total doesn't equal 100
    const total = easy + medium + hard;
    if (total !== 100) {
        elements.diffWarning.classList.remove('hidden');
        elements.diffWarning.textContent = `Total is ${total}% (should be 100%)`;
    } else {
        elements.diffWarning.classList.add('hidden');
    }
}

function updateConfigDisplay() {
    elements.numQuestionsValue.textContent = state.config.numQuestions;
    elements.easyValue.textContent = state.config.difficulty.easy + '%';
    elements.mediumValue.textContent = state.config.difficulty.medium + '%';
    elements.hardValue.textContent = state.config.difficulty.hard + '%';
}

function validateInputs() {
    const jobContent = elements.jobInput.value.trim();

    const isValid = jobContent.length >= 50;
    elements.startBtn.disabled = !isValid;

    if (!isValid) {
        elements.validationMessage.textContent = 'Job requirements need at least 50 characters.';
    } else {
        elements.validationMessage.textContent = '';
    }

    return isValid;
}

// Start Interview
async function startInterview() {
    if (!validateInputs()) return;

    // Normalize difficulty to 100%
    const total = state.config.difficulty.easy + state.config.difficulty.medium + state.config.difficulty.hard;
    if (total !== 100) {
        const factor = 100 / total;
        state.config.difficulty.easy = Math.round(state.config.difficulty.easy * factor);
        state.config.difficulty.medium = Math.round(state.config.difficulty.medium * factor);
        state.config.difficulty.hard = 100 - state.config.difficulty.easy - state.config.difficulty.medium;
    }

    showLoading(true);

    try {
        const response = await fetch(`${API_URL}/api/generate-questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_requirements: elements.jobInput.value.trim(),
                num_questions: state.config.numQuestions,
                difficulty: state.config.difficulty
            })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        state.sessionId = data.session_id;
        state.questions = data.questions;
        state.currentQuestionIndex = 0;
        state.answers = {};
        state.timerPerQuestion = state.config.timer;

        showLoading(false);
        showScreen('interview');
        displayQuestion();

    } catch (error) {
        showLoading(false);
        alert('Error generating questions: ' + error.message);
        console.error(error);
    }
}

// Display current question
function displayQuestion() {
    const question = state.questions[state.currentQuestionIndex];
    if (!question) return;

    // Update header
    elements.questionCounter.textContent = `Question ${state.currentQuestionIndex + 1} of ${state.questions.length}`;
    const progress = ((state.currentQuestionIndex) / state.questions.length) * 100;
    elements.progressFill.style.width = progress + '%';

    // Update question meta
    elements.difficultyBadge.textContent = capitalize(question.difficulty);
    elements.difficultyBadge.className = `badge difficulty-${question.difficulty}`;
    elements.categoryBadge.textContent = capitalize(question.category);

    // Update question text
    elements.questionText.textContent = question.question;

    // Create options
    elements.optionsContainer.innerHTML = '';
    const options = question.options;

    for (const [letter, text] of Object.entries(options)) {
        const optionBtn = document.createElement('button');
        optionBtn.className = 'option-btn';
        optionBtn.dataset.letter = letter;
        optionBtn.innerHTML = `
            <span class="option-letter">${letter}</span>
            <span class="option-text">${text}</span>
        `;
        optionBtn.addEventListener('click', () => selectOption(letter));
        elements.optionsContainer.appendChild(optionBtn);
    }

    // Reset UI state
    elements.nextBtn.disabled = true;

    // Start timer
    startTimer();
}

function selectOption(letter) {
    // Check if already answered
    if (state.answers[state.currentQuestionIndex] !== undefined) return;

    // Mark selected option
    const optionBtns = elements.optionsContainer.querySelectorAll('.option-btn');
    optionBtns.forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.letter === letter) {
            btn.classList.add('selected');
        }
    });

    // Submit answer
    submitAnswer(letter);
}

async function submitAnswer(selectedAnswer) {
    stopTimer();

    const question = state.questions[state.currentQuestionIndex];

    try {
        const response = await fetch(`${API_URL}/api/submit-answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: state.sessionId,
                question_id: question.id,
                selected_answer: selectedAnswer
            })
        });

        const data = await response.json();

        // Store answer locally (correct answer will be revealed at the end)
        state.answers[state.currentQuestionIndex] = {
            selected: selectedAnswer
        };

        // Enable next button - NO feedback shown
        elements.nextBtn.disabled = false;

        // Disable all options after selection
        const optionBtns = elements.optionsContainer.querySelectorAll('.option-btn');
        optionBtns.forEach(btn => {
            btn.disabled = true;
        });

    } catch (error) {
        console.error('Error submitting answer:', error);
    }
}

function nextQuestion() {
    state.currentQuestionIndex++;

    if (state.currentQuestionIndex >= state.questions.length) {
        showResults();
    } else {
        displayQuestion();
    }
}

// Timer functions
function startTimer() {
    if (state.timerPerQuestion === 0) {
        elements.timerDisplay.classList.add('hidden');
        return;
    }

    elements.timerDisplay.classList.remove('hidden');
    state.timeRemaining = state.timerPerQuestion;
    updateTimerDisplay();

    state.timerInterval = setInterval(() => {
        state.timeRemaining--;
        updateTimerDisplay();

        if (state.timeRemaining <= 0) {
            stopTimer();
            // Auto-submit with no answer
            const question = state.questions[state.currentQuestionIndex];
            if (state.answers[state.currentQuestionIndex] === undefined) {
                // Time ran out, record as unanswered
                state.answers[state.currentQuestionIndex] = {
                    selected: null
                };
                elements.nextBtn.disabled = false;

                // Disable all options
                const optionBtns = elements.optionsContainer.querySelectorAll('.option-btn');
                optionBtns.forEach(btn => btn.disabled = true);
            }
        }
    }, 1000);
}

function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

function updateTimerDisplay() {
    elements.timerValue.textContent = state.timeRemaining;

    // Add warning classes
    elements.timerDisplay.classList.remove('warning', 'danger');
    if (state.timeRemaining <= 10) {
        elements.timerDisplay.classList.add('danger');
    } else if (state.timeRemaining <= 20) {
        elements.timerDisplay.classList.add('warning');
    }
}

// Results
async function showResults() {
    stopTimer();
    showScreen('results');

    try {
        const response = await fetch(`${API_URL}/api/results/${state.sessionId}`);
        const data = await response.json();

        // Display score
        elements.scorePercentage.textContent = data.score.percentage + '%';
        elements.scoreText.textContent = `${data.score.correct} out of ${data.score.total} correct`;

        // Difficulty breakdown
        const diffBreakdown = data.difficulty_breakdown;
        elements.easyScore.textContent = `${diffBreakdown.easy.correct}/${diffBreakdown.easy.total}`;
        elements.mediumScore.textContent = `${diffBreakdown.medium.correct}/${diffBreakdown.medium.total}`;
        elements.hardScore.textContent = `${diffBreakdown.hard.correct}/${diffBreakdown.hard.total}`;

        // Question review
        elements.questionReviewContainer.innerHTML = '';
        data.questions.forEach((q, index) => {
            const isCorrect = q.is_correct;
            const reviewItem = document.createElement('div');
            reviewItem.className = `review-item ${isCorrect ? 'correct' : 'incorrect'}`;
            reviewItem.innerHTML = `
                <div class="review-header">
                    <span class="review-question">${index + 1}. ${q.question}</span>
                    <span class="review-status ${isCorrect ? 'correct' : 'incorrect'}">
                        ${isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                </div>
                <div class="review-answers">
                    ${q.selected_answer ? `Your answer: ${q.selected_answer}` : 'No answer'}
                    | Correct answer: ${q.correct_answer}
                </div>
                <div class="review-explanation">${q.explanation}</div>
            `;
            elements.questionReviewContainer.appendChild(reviewItem);
        });

    } catch (error) {
        console.error('Error fetching results:', error);
    }
}

function retryInterview() {
    state.currentQuestionIndex = 0;
    state.answers = {};
    showScreen('interview');
    displayQuestion();
}

function resetToSetup() {
    state.sessionId = null;
    state.questions = [];
    state.currentQuestionIndex = 0;
    state.answers = {};
    stopTimer();
    showScreen('setup');
}

// Utility functions
function showScreen(screenName) {
    const screens = ['setup', 'interview', 'results'];
    screens.forEach(name => {
        const screen = document.getElementById(`${name}-screen`);
        if (name === screenName) {
            screen.classList.add('active');
        } else {
            screen.classList.remove('active');
        }
    });
}

function showLoading(show) {
    if (show) {
        elements.loadingOverlay.classList.remove('hidden');
    } else {
        elements.loadingOverlay.classList.add('hidden');
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', init);
