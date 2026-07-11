import type {
  LoginResponse,
  GenerateChallengeRequest,
  GenerateChallengeResponse,
  SubmitScoreRequest,
  SubmitScoreResponse,
  LeaderboardResponse,
  UserProfileResponse,
} from '../../shared/types/index.js';

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('echokeys_token');
}

function headers(): HeadersInit {
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// Auth
export async function register(username: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ username }),
  });
  const data = await handleResponse<LoginResponse>(res);
  localStorage.setItem('echokeys_token', data.token);
  localStorage.setItem('echokeys_user', JSON.stringify(data.user));
  return data;
}

export async function login(username: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ username }),
  });
  const data = await handleResponse<LoginResponse>(res);
  localStorage.setItem('echokeys_token', data.token);
  localStorage.setItem('echokeys_user', JSON.stringify(data.user));
  return data;
}

export async function getMe(): Promise<{ user: LoginResponse['user'] }> {
  const res = await fetch(`${BASE}/auth/me`, { headers: headers() });
  return handleResponse(res);
}

export function getStoredUser() {
  const raw = localStorage.getItem('echokeys_user');
  return raw ? JSON.parse(raw) : null;
}

export function logout() {
  localStorage.removeItem('echokeys_token');
  localStorage.removeItem('echokeys_user');
}

// Challenges
export async function generateChallenge(req: GenerateChallengeRequest): Promise<GenerateChallengeResponse> {
  const res = await fetch(`${BASE}/challenges/generate`, {
    method: 'POST', headers: headers(), body: JSON.stringify(req),
  });
  return handleResponse(res);
}

// Scores
export async function submitScore(req: SubmitScoreRequest): Promise<SubmitScoreResponse> {
  const res = await fetch(`${BASE}/scores`, {
    method: 'POST', headers: headers(), body: JSON.stringify(req),
  });
  return handleResponse(res);
}

// Leaderboard
export async function getWeeklyLeaderboard(): Promise<LeaderboardResponse> {
  const res = await fetch(`${BASE}/leaderboard/weekly`, { headers: headers() });
  return handleResponse(res);
}

export async function getMonthlyLeaderboard(year: number, month: number): Promise<LeaderboardResponse> {
  const res = await fetch(`${BASE}/leaderboard/monthly/${year}/${month}`, { headers: headers() });
  return handleResponse(res);
}

export async function getYearlyLeaderboard(year: number): Promise<LeaderboardResponse> {
  const res = await fetch(`${BASE}/leaderboard/yearly/${year}`, { headers: headers() });
  return handleResponse(res);
}

export async function getAllTimeLeaderboard(): Promise<LeaderboardResponse> {
  const res = await fetch(`${BASE}/leaderboard/all-time`, { headers: headers() });
  return handleResponse(res);
}

export async function getUserProfile(userId: string): Promise<UserProfileResponse> {
  const res = await fetch(`${BASE}/leaderboard/profile/${userId}`, { headers: headers() });
  return handleResponse(res);
}

export async function getUserScores(userId: string) {
  const res = await fetch(`${BASE}/scores/user/${userId}`, { headers: headers() });
  return handleResponse<{ scores: any[] }>(res);
}
