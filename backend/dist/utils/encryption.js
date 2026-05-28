"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.timingSafeCompare = exports.generateUUID = exports.decryptData = exports.encryptData = exports.hashToken = exports.generateSecureOTP = exports.generateToken = exports.comparePassword = exports.hashPassword = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const env_1 = __importDefault(require("../config/env"));
const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
function getEncryptionKey(key) {
    return crypto_1.default.createHash('sha256').update(key).digest();
}
const hashPassword = async (password) => {
    const salt = await bcryptjs_1.default.genSalt(env_1.default.BCRYPT_SALT_ROUNDS);
    return bcryptjs_1.default.hash(password, salt);
};
exports.hashPassword = hashPassword;
const comparePassword = async (plain, hash) => {
    return bcryptjs_1.default.compare(plain, hash);
};
exports.comparePassword = comparePassword;
const generateToken = (length = 32) => {
    return crypto_1.default.randomBytes(length).toString('hex');
};
exports.generateToken = generateToken;
const generateSecureOTP = (digits = 6) => {
    const max = Math.pow(10, digits);
    const randomNumber = crypto_1.default.randomInt(0, max);
    return randomNumber.toString().padStart(digits, '0');
};
exports.generateSecureOTP = generateSecureOTP;
const hashToken = (token) => {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
};
exports.hashToken = hashToken;
const encryptData = (data, key = env_1.default.ENCRYPTION_KEY) => {
    const derivedKey = getEncryptionKey(key);
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, derivedKey, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const ivHex = iv.toString('hex');
    return `${ivHex}:${encrypted}`;
};
exports.encryptData = encryptData;
const decryptData = (encrypted, key = env_1.default.ENCRYPTION_KEY) => {
    const derivedKey = getEncryptionKey(key);
    const parts = encrypted.split(':');
    if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
    }
    const [ivHex, encryptedData] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== IV_LENGTH) {
        throw new Error('Invalid IV length');
    }
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, derivedKey, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};
exports.decryptData = decryptData;
const generateUUID = () => {
    return crypto_1.default.randomUUID();
};
exports.generateUUID = generateUUID;
const timingSafeCompare = (a, b) => {
    if (a.length !== b.length) {
        crypto_1.default.timingSafeEqual(Buffer.from(a), Buffer.from(a));
        return false;
    }
    return crypto_1.default.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};
exports.timingSafeCompare = timingSafeCompare;
//# sourceMappingURL=encryption.js.map