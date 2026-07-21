import fs from 'node:fs';
import path from 'node:path';
import type { Album, ConsentEntry, Item, ItemBytes, StoreDriver } from '../store';

/**
 * Driver local — lưu bằng filesystem tại .data/ (dev, zero-config).
 * Album metadata: .data/albums.json. Media: .data/media/<code>/<id>.<ext>.
 * KHÔNG bền trên serverless — production dùng driver Supabase.
 */

const DATA_DIR = path.join(process.cwd(), '.data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_PATH = path.join(DATA_DIR, 'albums.json');
const CONSENT_PATH = path.join(DATA_DIR, 'consent-log.json');

function ensure(): void {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '[]');
}

function readAll(): Album[] {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Album[];
  } catch {
    return [];
  }
}

function writeAll(list: Album[]): void {
  ensure();
  fs.writeFileSync(DB_PATH, JSON.stringify(list, null, 2));
}

function itemPath(code: string, item: Pick<Item, 'id' | 'ext'>): string {
  return path.join(MEDIA_DIR, code, `${item.id}.${item.ext}`);
}

export function createLocalDriver(): StoreDriver {
  return {
    async saveAlbum(album: Album, files: ItemBytes[]) {
      ensure();
      fs.mkdirSync(path.join(MEDIA_DIR, album.code), { recursive: true });
      for (const f of files) {
        const item = album.items.find((i) => i.id === f.id);
        if (!item) continue;
        fs.writeFileSync(itemPath(album.code, item), f.bytes);
      }
      const list = readAll();
      list.push(album);
      writeAll(list);
    },
    async getAlbum(code) {
      return readAll().find((a) => a.code === code) ?? null;
    },
    async getItemBytes(code, item) {
      return fs.readFileSync(itemPath(code, item));
    },
    async countByShop(shopName) {
      return readAll().filter((a) => a.shopName === shopName).length;
    },
    async logConsent(entry: ConsentEntry) {
      ensure();
      const path_ = CONSENT_PATH;
      let list: ConsentEntry[] = [];
      try {
        list = JSON.parse(fs.readFileSync(path_, 'utf8')) as ConsentEntry[];
      } catch {
        list = [];
      }
      list.push(entry);
      fs.writeFileSync(path_, JSON.stringify(list, null, 2));
    },
  };
}
