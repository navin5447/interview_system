/**
 * AI Interview Simulator - Frontend Logic
 * Handles state management, API calls, timer, and UI interactions
 */

// Configuration
const API_URL = 'http://localhost:8000';

const ROUND_PROXY_PENALTIES = {
    mcq: { tab_hidden: 12, window_blur: 8, fullscreen_exit: 15, phone_detected: 25, multiple_faces: 20, no_face: 10 },
    aptitude: { tab_hidden: 8, window_blur: 6, fullscreen_exit: 10, phone_detected: 20, multiple_faces: 15, no_face: 8 },
    coding: { tab_hidden: 10, window_blur: 6, fullscreen_exit: 12, phone_detected: 22, multiple_faces: 18, no_face: 8 },
    technical: { tab_hidden: 12, window_blur: 8, fullscreen_exit: 15, phone_detected: 25, multiple_faces: 20, no_face: 10 }
};

// Application State
const state = {
    sessionId: null,
    questions: [],
    currentQuestionIndex: 0,
    answers: {},
    timerInterval: null,
    timeRemaining: 0,
    timerPerQuestion: 60,
    candidateMode: false,
    submitUrl: null,
    applicationId: null,
    roundNumber: null,
    proxyRoundType: 'mcq',
    proxy: {
        score: 100,
        events: [],
        monitoring: false,
        mediaStream: null,
        monitorIntervalId: null,
        visionIntervalId: null,
        visionInFlight: false,
        objectDetector: null,
        faceDetector: null,
        modelsReady: false,
        noFaceStreak: 0,
        lastViolationAt: {}
    },
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
    newInterviewBtn: document.getElementById('new-interview-btn'),

    // Security modal
    securityModal: document.getElementById('security-modal'),
    securityApproveBtn: document.getElementById('security-approve-btn'),
    securityError: document.getElementById('security-error'),
    proxyVideo: document.getElementById('proxy-video'),
    proxyCanvas: document.getElementById('proxy-canvas')
};

// Initialize application
function init() {
    setupEventListeners();
    applyPrefillFromQuery();
    updateConfigDisplay();
    validateInputs();

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && validateInputs()) {
        startInterview();
    }
}

function applyPrefillFromQuery() {
    const params = new URLSearchParams(window.location.search);

    state.candidateMode = params.get('candidate_mode') === '1';
    state.submitUrl = params.get('submit_url');
    state.applicationId = params.get('application_id');
    state.roundNumber = params.get('round_number');
    state.proxyRoundType = (params.get('proxy_round') || 'mcq').toLowerCase();

    const jobRequirements = params.get('job_requirements');
    if (jobRequirements) {
        elements.jobInput.value = jobRequirements;
    }

    const numQuestions = parseInt(params.get('num_questions') || '', 10);
    if (!Number.isNaN(numQuestions) && numQuestions >= 5 && numQuestions <= 30) {
        elements.numQuestions.value = String(numQuestions);
        state.config.numQuestions = numQuestions;
    }

    const timer = parseInt(params.get('timer') || '', 10);
    if (!Number.isNaN(timer) && [0, 30, 60, 90].includes(timer)) {
        elements.timerSelect.value = String(timer);
        state.config.timer = timer;
    }

    const easy = parseInt(params.get('easy') || '', 10);
    const medium = parseInt(params.get('medium') || '', 10);
    const hard = parseInt(params.get('hard') || '', 10);
    if (![easy, medium, hard].some(Number.isNaN)) {
        elements.easyPercent.value = String(easy);
        elements.mediumPercent.value = String(medium);
        elements.hardPercent.value = String(hard);
        updateDifficultySliders();
    }

    if (state.candidateMode) {
        const settingsSection = document.querySelector('.settings-section');
        if (settingsSection) {
            settingsSection.style.display = 'none';
        }
        elements.jobInput.readOnly = true;
        elements.numQuestions.disabled = true;
        elements.timerSelect.disabled = true;
        elements.easyPercent.disabled = true;
        elements.mediumPercent.disabled = true;
        elements.hardPercent.disabled = true;
        elements.validationMessage.textContent = '';
    }
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

    if (elements.securityApproveBtn) {
        elements.securityApproveBtn.addEventListener('click', approveSecurityAndContinue);
    }
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

async function requestFullscreenSafe() {
    try {
        const docEl = document.documentElement;
        const currentFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
        if (!currentFullscreen) {
            const requestFn =
                docEl.requestFullscreen ||
                docEl.webkitRequestFullscreen ||
                docEl.msRequestFullscreen;
            if (!requestFn) return false;
            await requestFn.call(docEl);
        }
        return true;
    } catch {
        return false;
    }
}

async function requestMediaPermission() {
    try {
        if (state.proxy.mediaStream) {
            attachStreamToProxyVideo(state.proxy.mediaStream);
            return true;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        state.proxy.mediaStream = stream;
        attachStreamToProxyVideo(stream);
        return true;
    } catch {
        return false;
    }
}

function attachStreamToProxyVideo(stream) {
    if (!elements.proxyVideo) return;
    elements.proxyVideo.srcObject = stream;
    elements.proxyVideo.play().catch(() => {});
}

function isFullscreenActive() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

function stopProxyMediaStream() {
    if (state.proxy.mediaStream) {
        state.proxy.mediaStream.getTracks().forEach(track => track.stop());
        state.proxy.mediaStream = null;
    }

    if (elements.proxyVideo) {
        elements.proxyVideo.srcObject = null;
    }
}

function registerProxyViolationWithCooldown(type, penalty, cooldownMs = 6000) {
    const now = Date.now();
    const lastAt = state.proxy.lastViolationAt[type] || 0;
    if (now - lastAt < cooldownMs) {
        return;
    }

    state.proxy.lastViolationAt[type] = now;
    registerProxyViolation(type, penalty);
}

function registerProxyViolation(type, penalty) {
    const roundType = (state.proxyRoundType || 'mcq').toLowerCase();
    const mapping = ROUND_PROXY_PENALTIES[roundType] || ROUND_PROXY_PENALTIES.mcq;
    const appliedPenalty = Number.isFinite(mapping[type]) ? mapping[type] : penalty;
    state.proxy.score = Math.max(0, state.proxy.score - appliedPenalty);
    state.proxy.events.push({ type, penalty: appliedPenalty, round: state.proxyRoundType, timestamp: Date.now() });
}

function startProxyMonitoring() {
    if (state.proxy.monitoring) return;
    state.proxy.monitoring = true;

    document.addEventListener('visibilitychange', onProxyVisibilityChange);
    window.addEventListener('blur', onProxyWindowBlur);
    document.addEventListener('fullscreenchange', onProxyFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onProxyFullscreenChange);
    document.addEventListener('MSFullscreenChange', onProxyFullscreenChange);

    state.proxy.monitorIntervalId = window.setInterval(() => {
        if (!state.proxy.monitoring) return;
        if (!isFullscreenActive()) {
            registerProxyViolationWithCooldown('fullscreen_exit', 15, 4000);
            requestFullscreenSafe();
        }
    }, 1500);

    if (state.proxy.modelsReady) {
        state.proxy.visionIntervalId = window.setInterval(runVisionChecks, 2500);
    }
}

function stopProxyMonitoring() {
    state.proxy.monitoring = false;
    document.removeEventListener('visibilitychange', onProxyVisibilityChange);
    window.removeEventListener('blur', onProxyWindowBlur);
    document.removeEventListener('fullscreenchange', onProxyFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', onProxyFullscreenChange);
    document.removeEventListener('MSFullscreenChange', onProxyFullscreenChange);

    if (state.proxy.monitorIntervalId) {
        window.clearInterval(state.proxy.monitorIntervalId);
        state.proxy.monitorIntervalId = null;
    }

    if (state.proxy.visionIntervalId) {
        window.clearInterval(state.proxy.visionIntervalId);
        state.proxy.visionIntervalId = null;
    }

    state.proxy.visionInFlight = false;
    state.proxy.noFaceStreak = 0;
}

function onProxyVisibilityChange() {
    if (!state.proxy.monitoring) return;
    if (document.hidden) {
        registerProxyViolationWithCooldown('tab_hidden', 12, 4000);
    }
}

function onProxyWindowBlur() {
    if (!state.proxy.monitoring) return;
    registerProxyViolationWithCooldown('window_blur', 8, 4000);
}

function onProxyFullscreenChange() {
    if (!state.proxy.monitoring) return;
    if (!isFullscreenActive()) {
        registerProxyViolationWithCooldown('fullscreen_exit', 15, 4000);
        requestFullscreenSafe();
    }
}

async function loadVisionModels() {
    if (state.proxy.modelsReady) {
        return true;
    }

    const hasTf = typeof window.tf !== 'undefined';
    const hasCoco = typeof window.cocoSsd !== 'undefined';
    const hasFaceDetection = typeof window.FaceDetection !== 'undefined';

    if (!hasTf || !hasCoco || !hasFaceDetection) {
        return false;
    }

    try {
        if (!state.proxy.objectDetector) {
            state.proxy.objectDetector = await window.cocoSsd.load();
        }

        if (!state.proxy.faceDetector) {
            const faceDetector = new window.FaceDetection({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
            });
            faceDetector.setOptions({
                modelSelection: 0,
                minDetectionConfidence: 0.5
            });
            state.proxy.faceDetector = faceDetector;
        }

        state.proxy.modelsReady = true;
        return true;
    } catch (error) {
        console.error('Failed to load proctoring models:', error);
        return false;
    }
}

async function detectPhone() {
    if (!state.proxy.objectDetector || !elements.proxyVideo) {
        return false;
    }

    const predictions = await state.proxy.objectDetector.detect(elements.proxyVideo);
    return predictions.some((item) => item.class === 'cell phone' && item.score >= 0.5);
}

function detectFaceCount() {
    return new Promise((resolve) => {
        if (!state.proxy.faceDetector || !elements.proxyVideo) {
            resolve(0);
            return;
        }

        const timeoutId = window.setTimeout(() => resolve(0), 1000);
        state.proxy.faceDetector.onResults((result) => {
            window.clearTimeout(timeoutId);
            const count = Array.isArray(result?.detections) ? result.detections.length : 0;
            resolve(count);
        });

        state.proxy.faceDetector.send({ image: elements.proxyVideo }).catch(() => {
            window.clearTimeout(timeoutId);
            resolve(0);
        });
    });
}

async function runVisionChecks() {
    if (!state.proxy.monitoring || !state.proxy.modelsReady || state.proxy.visionInFlight) {
        return;
    }

    if (!elements.proxyVideo || elements.proxyVideo.readyState < 2) {
        return;
    }

    state.proxy.visionInFlight = true;

    try {
        const [phoneDetected, faceCount] = await Promise.all([
            detectPhone(),
            detectFaceCount()
        ]);

        if (phoneDetected) {
            registerProxyViolationWithCooldown('phone_detected', 25, 9000);
        }

        if (faceCount > 1) {
            registerProxyViolationWithCooldown('multiple_faces', 20, 9000);
            state.proxy.noFaceStreak = 0;
        } else if (faceCount === 0) {
            state.proxy.noFaceStreak += 1;
            if (state.proxy.noFaceStreak >= 2) {
                registerProxyViolationWithCooldown('no_face', 10, 9000);
                state.proxy.noFaceStreak = 0;
            }
        } else {
            state.proxy.noFaceStreak = 0;
        }
    } catch (error) {
        console.error('Vision check failed:', error);
    } finally {
        state.proxy.visionInFlight = false;
    }
}

async function approveSecurityAndContinue() {
    if (elements.securityError) {
        elements.securityError.textContent = '';
    }

    const mediaOk = await requestMediaPermission();
    if (!mediaOk) {
        if (elements.securityError) {
            elements.securityError.textContent = 'Camera and microphone permission is required.';
        }
        return;
    }

    const fullscreenOk = await requestFullscreenSafe();
    if (!fullscreenOk) {
        if (elements.securityError) {
            elements.securityError.textContent = 'Fullscreen mode is required to continue.';
        }
        return;
    }

    const modelsReady = await loadVisionModels();
    if (!modelsReady) {
        if (elements.securityError) {
            elements.securityError.textContent = 'AI proctoring models failed to load. Check network and retry.';
        }
        return;
    }

    if (elements.securityModal) {
        elements.securityModal.classList.add('hidden');
    }

    startProxyMonitoring();
    await beginInterviewAfterSecurity();
}

// Start Interview
async function startInterview() {
    if (!validateInputs()) return;

    if (elements.securityModal) {
        elements.securityModal.classList.remove('hidden');
    }
}

// Start Interview after security approval
async function beginInterviewAfterSecurity() {
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
            let details = `API error: ${response.status}`;
            try {
                const errorPayload = await response.json();
                if (errorPayload && errorPayload.detail) {
                    details = String(errorPayload.detail);
                }
            } catch (_) {
                // keep default details
            }
            throw new Error(details);
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
    stopProxyMonitoring();
    stopProxyMediaStream();
    showScreen('results');

    try {
        const response = await fetch(`${API_URL}/api/results/${state.sessionId}`);
        const data = await response.json();

        if (state.candidateMode) {
            await submitCandidateResult(data);
            elements.scorePercentage.textContent = 'Done';
            elements.scoreText.textContent = `Your MCQ round is submitted successfully. Recruiter will review your score. Proxy score: ${state.proxy.score}`;

            const breakdown = document.querySelector('.results-breakdown');
            const details = document.querySelector('.results-details');
            const actions = document.querySelector('.results-actions');
            if (breakdown) breakdown.style.display = 'none';
            if (details) details.style.display = 'none';
            if (actions) actions.style.display = 'none';
            return;
        }

        // Display score
        elements.scorePercentage.textContent = data.score.percentage + '%';
        elements.scoreText.textContent = `${data.score.correct} out of ${data.score.total} correct | Proxy score: ${state.proxy.score}`;

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

async function submitCandidateResult(resultData) {
    if (!state.submitUrl) {
        return;
    }

    try {
        await fetch(state.submitUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: state.sessionId,
                result: resultData,
                application_id: state.applicationId,
                round_number: state.roundNumber,
                proxy_score: state.proxy.score,
                proxy_events: state.proxy.events
            })
        });
    } catch (error) {
        console.error('Error submitting MCQ result to recruiter backend:', error);
    }
}

function retryInterview() {
    state.currentQuestionIndex = 0;
    state.answers = {};
    state.proxy.score = 100;
    state.proxy.events = [];
    showScreen('interview');
    displayQuestion();
}

function resetToSetup() {
    state.sessionId = null;
    state.questions = [];
    state.currentQuestionIndex = 0;
    state.answers = {};
    state.proxy.score = 100;
    state.proxy.events = [];
    stopProxyMonitoring();
    stopProxyMediaStream();
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
