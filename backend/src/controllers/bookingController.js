const bookingService = require('../services/bookingService');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const createBooking = asyncHandler(async (req, res) => {
  const slotId = Number(req.body.slotId);
  const booking = await bookingService.createBooking({ userId: req.user.id, slotId });
  res.status(201).json({ success: true, data: booking });
});

const cancelBooking = asyncHandler(async (req, res) => {
  const bookingId = Number(req.params.bookingId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    throw ApiError.badRequest('Invalid booking id');
  }
  const booking = await bookingService.cancelBooking({ userId: req.user.id, bookingId });
  res.status(200).json({ success: true, data: booking });
});

const myBookings = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 20;
  const result = await bookingService.listMyBookings(req.user.id, { page, pageSize });
  res.status(200).json({ success: true, data: result });
});

module.exports = { createBooking, cancelBooking, myBookings };
