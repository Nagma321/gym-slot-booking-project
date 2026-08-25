function formatTime(t) {
  return t?.slice(0, 5);
}

function formatDate(d) {
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function SlotCard({ slot, onBook, isBooking }) {
  let badgeClass = 'badge-available';
  let badgeText = `${slot.remainingCapacity} spots left`;
  if (slot.isFull) {
    badgeClass = 'badge-full';
    badgeText = 'Full';
  } else if (slot.remainingCapacity <= 3) {
    badgeClass = 'badge-limited';
  }

  return (
    <div className="card slot-card">
      <div className="slot-date">{formatDate(slot.date)}</div>
      <div className="slot-time">
        {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
      </div>
      <div className="slot-capacity-row">
        <span>
          {slot.bookedCount} / {slot.capacity} booked
        </span>
        <span className={`badge ${badgeClass}`}>{badgeText}</span>
      </div>
      <button
        className="btn btn-primary"
        disabled={slot.isFull || isBooking}
        onClick={() => onBook(slot.id)}
      >
        {isBooking ? 'Booking…' : slot.isFull ? 'Full' : 'Book slot'}
      </button>
    </div>
  );
}
