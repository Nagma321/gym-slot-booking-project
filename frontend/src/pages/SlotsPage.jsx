import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import SlotCard from '../components/SlotCard';

export default function SlotsPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [bookingSlotId, setBookingSlotId] = useState(null);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getSlots(1, 50);
      setSlots(data.slots);
    } catch (err) {
      setError(err.message || 'Failed to load slots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleBook = async (slotId) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setError('');
    setSuccessMessage('');
    setBookingSlotId(slotId);
    try {
      await api.createBooking(slotId);
      setSuccessMessage('Slot booked successfully!');
      await loadSlots();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBookingSlotId(null);
    }
  };

  return (
    <div className="page-container">
      <h1 className="page-title">Available Gym Slots</h1>
      <p className="page-subtitle">Book a slot below. Each slot holds up to 10 people.</p>

      {error && <div className="error-banner">{error}</div>}
      {successMessage && <div className="success-banner">{successMessage}</div>}

      {loading ? (
        <div className="loading-state">Loading slots…</div>
      ) : slots.length === 0 ? (
        <div className="empty-state">No gym slots are available right now.</div>
      ) : (
        <div className="slot-grid">
          {slots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              onBook={handleBook}
              isBooking={bookingSlotId === slot.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
