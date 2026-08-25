import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

function formatSlot(slot) {
  const date = new Date(slot.date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${date} · ${slot.startTime?.slice(0, 5)}–${slot.endTime?.slice(0, 5)}`;
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [cancelingId, setCancelingId] = useState(null);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getMyBookings(1, 50);
      setBookings(data.bookings);
    } catch (err) {
      setError(err.message || 'Failed to load your bookings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const handleCancel = async (bookingId) => {
    setError('');
    setSuccessMessage('');
    setCancelingId(bookingId);
    try {
      await api.cancelBooking(bookingId);
      setSuccessMessage('Booking cancelled.');
      await loadBookings();
    } catch (err) {
      setError(err.message || 'Failed to cancel booking');
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div className="page-container">
      <h1 className="page-title">My Bookings</h1>
      <p className="page-subtitle">View and manage your gym slot bookings.</p>

      {error && <div className="error-banner">{error}</div>}
      {successMessage && <div className="success-banner">{successMessage}</div>}

      {loading ? (
        <div className="loading-state">Loading your bookings…</div>
      ) : bookings.length === 0 ? (
        <div className="empty-state">You haven&apos;t booked any slots yet.</div>
      ) : (
        <div className="booking-list">
          {bookings.map((booking) => (
            <div key={booking.id} className="card booking-row">
              <div>
                <div>{formatSlot(booking.slot)}</div>
                <span
                  className={`booking-status ${
                    booking.status === 'ACTIVE' ? 'status-active' : 'status-cancelled'
                  }`}
                >
                  {booking.status}
                </span>
              </div>
              {booking.status === 'ACTIVE' && (
                <button
                  className="btn btn-danger btn-small"
                  disabled={cancelingId === booking.id}
                  onClick={() => handleCancel(booking.id)}
                >
                  {cancelingId === booking.id ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
