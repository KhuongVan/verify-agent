import crypto from 'node:crypto';

/**
 * Sinh cặp khoá Ed25519 và in ra dạng dán thẳng vào biến môi trường (Vercel/.env).
 * Chạy: npm run genkey
 * KHÔNG commit khoá riêng. Giữ nó trong secret manager / Vercel env.
 */
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim();
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim();
const keyId = crypto.createHash('sha256').update(pub).digest('hex').slice(0, 16);

const enc = (s) => s.replace(/\n/g, '\\n');

console.log('# --- Dán vào Vercel Environment Variables (hoặc .env.local) ---');
console.log(`SIGNING_KEY_ID="${keyId}"`);
console.log(`SIGNING_PRIVATE_KEY_PEM="${enc(priv)}"`);
console.log(`SIGNING_PUBLIC_KEY_PEM="${enc(pub)}"`);
console.log('# Giữ BÍ MẬT khoá riêng. Không commit, không chia sẻ.');
