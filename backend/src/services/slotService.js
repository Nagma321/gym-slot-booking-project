const slotRepository = require('../repositories/slotRepository');
const cacheService = require('../services/cacheService');
const ApiError = require('../utils/ApiError');

async function getSlots({ page, pageSize }) {
  const cached = await cacheService.getCachedSlotsList(page, pageSize);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const result = await slotRepository.listSlots({ page, pageSize });
  await cacheService.setCachedSlotsList(page, pageSize, result);
  return { ...result, fromCache: false };
}

async function getSlotById(slotId) {
  const cached = await cacheService.getCachedSlot(slotId);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const slot = await slotRepository.findById(slotId);
  if (!slot) {
    throw ApiError.notFound('Gym slot not found');
  }
  await cacheService.setCachedSlot(slotId, slot);
  return { ...slot, fromCache: false };
}

module.exports = { getSlots, getSlotById };
