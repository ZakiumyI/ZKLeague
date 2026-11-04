export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor.", "network");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error || `Error ${res.status}`, data.code);
  }
  return data;
}

export const api = {
  config: () => request("GET", "/auth/config"),
  me: () => request("GET", "/auth/me"),
  prelogin: (username) => request("POST", "/auth/prelogin", { username }),
  login: (username, authKey) => request("POST", "/auth/login", { username, authKey }),
  register: (payload) => request("POST", "/auth/register", payload),
  logout: () => request("POST", "/auth/logout"),

  platforms: () => request("GET", "/accounts/platforms"),
  listAccounts: () => request("GET", "/accounts"),
  createAccount: (payload) => request("POST", "/accounts", payload),
  updateAccount: (id, payload) => request("PATCH", `/accounts/${id}`, payload),
  refreshAccount: (id) => request("POST", `/accounts/${id}/refresh`),
  deleteAccount: (id) => request("DELETE", `/accounts/${id}`),
  matches: (id, limit = 50) => request("GET", `/accounts/${id}/matches?limit=${limit}`)
};
