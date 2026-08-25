const slotService = require('../services/slotService');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const listSlots = asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const result = await slotService.getSlots({ page, pageSize });
  res.status(200).json({ success: true, data: result });
});

const getSlot = asyncHandler(async (req, res) => {
  const slotId = Number(req.params.id);
  if (!Number.isInteger(slotId) || slotId <= 0) {
    throw ApiError.badRequest('Invalid slot id');
  }
  const slot = await slotService.getSlotById(slotId);
  res.status(200).json({ success: true, data: slot });
});

module.exports = { listSlots, getSlot };
