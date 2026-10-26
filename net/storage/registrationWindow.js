import { StorageError } from './matchStore.js';

// Cổng kiểm tra khung mở/đóng đơn đăng ký (config đã parse).
export function assertRegistrationWindowOpen(config, now = Date.now()) {
  const open = config?.registrationOpensAt ? new Date(config.registrationOpensAt).getTime() : null;
  const close = config?.registrationClosesAt ? new Date(config.registrationClosesAt).getTime() : null;
  if (open !== null && now < open) {
    throw new StorageError('REGISTRATION_NOT_OPEN', 'Chưa tới thời gian mở đơn đăng ký', 409);
  }
  if (close !== null && now > close) {
    throw new StorageError('REGISTRATION_CLOSED', 'Đã đóng đơn đăng ký', 409);
  }
}

