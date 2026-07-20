import fs from 'node:fs';
import path from 'node:path';
import type { Proof, StoreDriver } from '../store';

/**
 * Driver local — lưu bằng filesystem tại .data/ (dùng cho dev, zero-config).
 * KHÔNG bền trên serverless (Vercel) — production dùng driver Supabase.
 */

const DATA_DIR = path.join(process.cwd(), '.data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_PATH = path.join(DATA_DIR, 'proofs.json');

function ensure(): void {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '[]');
}

function readAll(): Proof[] {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Proof[];
  } catch {
    return [];
  }
}

function writeAll(list: Proof[]): void {
  ensure();
  fs.writeFileSync(DB_PATH, JSON.stringify(list, null, 2));
}

function mediaPath(p: Pick<Proof, 'code' | 'ext'>): string {
  return path.join(MEDIA_DIR, `${p.code}.${p.ext}`);
}

export function createLocalDriver(): StoreDriver {
  return {
    async saveProof(proof, bytes) {
      ensure();
      fs.writeFileSync(mediaPath(proof), bytes);
      const list = readAll();
      list.push(proof);
      writeAll(list);
    },
    async getProof(code) {
      return readAll().find((p) => p.code === code) ?? null;
    },
    async getMediaBytes(proof) {
      return fs.readFileSync(mediaPath(proof));
    },
    async countByShop(shopName) {
      return readAll().filter((p) => p.shopName === shopName).length;
    },
  };
}
