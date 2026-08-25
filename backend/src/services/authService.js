const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const { signToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const { logActivity } = require('./activityLogService');

const SALT_ROUNDS = 10;

async function register({ name, email, password }) {
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userRepository.createUser({ name, email, passwordHash });

  await logActivity({
    userId: user.id,
    action: 'USER_REGISTERED',
    metadata: { email: user.email },
  });

  const token = signToken({ sub: user.id, email: user.email });
  return { user, token };
}

async function login({ email, password }) {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  await logActivity({
    userId: user.id,
    action: 'USER_LOGGED_IN',
    metadata: { email: user.email },
  });

  const token = signToken({ sub: user.id, email: user.email });
  const safeUser = { id: user.id, name: user.name, email: user.email, createdAt: user.created_at };
  return { user: safeUser, token };
}

module.exports = { register, login };
