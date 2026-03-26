import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interview APIs
export const startInterview = async (config) => {
  const response = await api.post('/interviews/start', config);
  return response.data;
};

export const getInterviewStatus = async (interviewId) => {
  const response = await api.get(`/interviews/${interviewId}`);
  return response.data;
};

export const completeInterview = async (interviewId) => {
  const response = await api.post(`/interviews/${interviewId}/complete`);
  return response.data;
};

export const getAvailableCounts = async () => {
  const response = await api.get('/interviews/available/counts');
  return response.data;
};

// Question APIs
export const getQuestion = async (questionId, interviewId) => {
  const params = interviewId ? `?interview_id=${interviewId}` : '';
  const response = await api.get(`/questions/${questionId}${params}`);
  return response.data;
};

export const getInterviewQuestions = async (interviewId) => {
  const response = await api.get(`/questions/interview/${interviewId}`);
  return response.data;
};

// Submission APIs
export const runCode = async (data) => {
  const response = await api.post('/submissions/run', data);
  return response.data;
};

export const submitCode = async (data) => {
  const response = await api.post('/submissions/submit', data);
  return response.data;
};

export const getResults = async (interviewId) => {
  const response = await api.get(`/submissions/results/${interviewId}`);
  return response.data;
};

export const getSubmissionHistory = async (interviewId, questionId) => {
  const response = await api.get(`/submissions/history/${interviewId}/${questionId}`);
  return response.data;
};

export default api;
