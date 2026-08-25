const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

class ApiClientError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function getToken() {
  return localStorage.getItem('gym_auth_token');
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiClientError('Could not reach the server. Please check your connection.', 0);
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message = json?.error?.message || `Request failed with status ${res.status}`;
    throw new ApiClientError(message, res.status, json?.error?.details);
  }

  return json?.data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  getSlots: (page = 1, pageSize = 20) => request(`/slots?page=${page}&pageSize=${pageSize}`),
  getSlot: (id) => request(`/slots/${id}`),
  createBooking: (slotId) => request('/bookings', { method: 'POST', body: { slotId }, auth: true }),
  cancelBooking: (bookingId) => request(`/bookings/${bookingId}`, { method: 'DELETE', auth: true }),
  getMyBookings: (page = 1, pageSize = 20) =>
    request(`/bookings/me?page=${page}&pageSize=${pageSize}`, { auth: true }),
};

export { ApiClientError };
