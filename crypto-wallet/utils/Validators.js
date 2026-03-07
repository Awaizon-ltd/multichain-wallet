import { isValidAddress } from './Wallet';

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Is valid email
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password meets requirements
 * @param {string} password - Password to validate
 * @returns {object} Validation result
 */
export const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const errors = [];
  
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  if (!hasUpperCase) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!hasLowerCase) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!hasNumbers) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    strength: calculatePasswordStrength(password, hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar),
  };
};

/**
 * Calculate password strength
 * @returns {string} Strength level: weak, medium, strong
 */
const calculatePasswordStrength = (password, hasUpper, hasLower, hasNumbers, hasSpecial) => {
  let score = 0;
  
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (hasUpper && hasLower) score++;
  if (hasNumbers) score++;
  if (hasSpecial) score++;
  
  if (score <= 2) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
};

/**
 * Validate transaction amount
 * @param {string} amount - Amount to validate
 * @param {string} balance - Available balance
 * @returns {object} Validation result
 */
export const validateAmount = (amount, balance) => {
  const errors = [];
  
  if (!amount || amount.trim() === '') {
    errors.push('Amount is required');
    return { isValid: false, errors };
  }
  
  const numAmount = parseFloat(amount);
  const numBalance = parseFloat(balance);
  
  if (isNaN(numAmount)) {
    errors.push('Invalid amount format');
  } else {
    if (numAmount <= 0) {
      errors.push('Amount must be greater than 0');
    }
    if (numAmount > numBalance) {
      errors.push('Insufficient balance');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate wallet address
 * @param {string} address - Address to validate
 * @returns {object} Validation result
 */
export const validateAddress = (address) => {
  const errors = [];
  
  if (!address || address.trim() === '') {
    errors.push('Address is required');
  } else if (!isValidAddress(address)) {
    errors.push('Invalid Ethereum address format');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate wallet name
 * @param {string} name - Name to validate
 * @returns {object} Validation result
 */
export const validateWalletName = (name) => {
  const errors = [];
  
  if (!name || name.trim() === '') {
    errors.push('Wallet name is required');
  } else if (name.length < 3) {
    errors.push('Wallet name must be at least 3 characters');
  } else if (name.length > 50) {
    errors.push('Wallet name must be less than 50 characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Sanitize input string
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[<>]/g, '');
};