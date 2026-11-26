// Empty in development (CRA proxies /api to localhost:5000, see package.json).
// In production set REACT_APP_API_URL to the deployed API origin, e.g. https://devclan-api.onrender.com
export const API_BASE = process.env.REACT_APP_API_URL || "";

// Demo auth: the API acts as whichever seeded user is sent in X-Demo-User.
// Real login is a known TODO; this exists so the Following feed can be demonstrated.
export const DEMO_USERS = [
  { id: "a0000000-0000-0000-0000-000000000001", name: "demo_user" },
  { id: "a0000000-0000-0000-0000-000000000002", name: "alice" },
  { id: "a0000000-0000-0000-0000-000000000003", name: "bob" },
  { id: "a0000000-0000-0000-0000-000000000004", name: "carol" },
  { id: "a0000000-0000-0000-0000-000000000005", name: "dave" },
];

let currentUserId = DEMO_USERS[0].id;
export const setCurrentUser = (id) => {
  currentUserId = id;
};

export function apiFetch(path, options = {}) {
  const headers = { "X-Demo-User": currentUserId, ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
