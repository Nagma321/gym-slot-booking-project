/**
 * Minimal structured logger. Kept dependency-free on purpose - this is a
 * small assessment project and does not need a full logging framework.
 * Never log secrets (passwords, JWTs, connection strings).
 */
function timestamp() {
  return new Date().toISOString();
}

function serializeMeta(meta) {
  if (!meta) return '';
  try {
    return ' ' + JSON.stringify(meta);
  } catch {
    return '';
  }
}

const logger = {
  info(message, meta) {
    console.log(`[${timestamp()}] INFO  ${message}${serializeMeta(meta)}`);
  },
  warn(message, meta) {
    console.warn(`[${timestamp()}] WARN  ${message}${serializeMeta(meta)}`);
  },
  error(message, meta) {
    console.error(`[${timestamp()}] ERROR ${message}${serializeMeta(meta)}`);
  },
};

module.exports = logger;
