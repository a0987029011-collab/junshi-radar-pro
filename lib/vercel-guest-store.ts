import { deflateRawSync, inflateRawSync } from "node:zlib";

const COOKIE_PREFIX = "jr_guest_";
const COOKIE_CHUNK_SIZE = 3_000;
const MAX_COOKIE_CHUNKS = 24;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type JsonResponseInit = Omit<ResponseInit, "headers"> & {
  headers?: HeadersInit;
};

function cookieName(storageKey: string) {
  return `${COOKIE_PREFIX}${storageKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function parseCookies(request: Request) {
  const values = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    values.set(name, part.slice(separator + 1).trim());
  }
  return values;
}

function encode(value: unknown) {
  return deflateRawSync(Buffer.from(JSON.stringify(value))).toString("base64url");
}

function decode<T>(value: string): T {
  return JSON.parse(inflateRawSync(Buffer.from(value, "base64url")).toString("utf8")) as T;
}

function persistentCookie(name: string, value: string) {
  return `${name}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function expiredCookie(name: string) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function isVercelRequest(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname.endsWith(".vercel.app") || process.env.VERCEL === "1";
}

export function createVercelGuestStore(request: Request) {
  const cookies = parseCookies(request);
  const changes = new Map<string, unknown | undefined>();

  function read<T>(storageKey: string, fallback: T): T {
    if (changes.has(storageKey)) {
      return (changes.get(storageKey) ?? fallback) as T;
    }
    const name = cookieName(storageKey);
    const count = Number(cookies.get(`${name}_count`) ?? "0");
    if (!Number.isInteger(count) || count < 1 || count > MAX_COOKIE_CHUNKS) {
      return fallback;
    }
    let encoded = "";
    for (let index = 0; index < count; index += 1) {
      const chunk = cookies.get(`${name}_${index}`);
      if (!chunk) return fallback;
      encoded += chunk;
    }
    try {
      return decode<T>(encoded);
    } catch {
      return fallback;
    }
  }

  function write(storageKey: string, value: unknown) {
    changes.set(storageKey, value);
  }

  function remove(storageKey: string) {
    changes.set(storageKey, undefined);
  }

  function json(payload: unknown, init: JsonResponseInit = {}) {
    const response = Response.json(payload, init);
    response.headers.set("Cache-Control", "private, no-store");
    for (const [storageKey, value] of changes) {
      const name = cookieName(storageKey);
      const previousCount = Number(cookies.get(`${name}_count`) ?? "0");
      if (value === undefined) {
        response.headers.append("Set-Cookie", expiredCookie(`${name}_count`));
        for (let index = 0; index < Math.min(previousCount, MAX_COOKIE_CHUNKS); index += 1) {
          response.headers.append("Set-Cookie", expiredCookie(`${name}_${index}`));
        }
        continue;
      }

      const encoded = encode(value);
      const chunks = Array.from(
        { length: Math.ceil(encoded.length / COOKIE_CHUNK_SIZE) },
        (_, index) => encoded.slice(index * COOKIE_CHUNK_SIZE, (index + 1) * COOKIE_CHUNK_SIZE),
      );
      if (chunks.length > MAX_COOKIE_CHUNKS) {
        throw new Error("匿名瀏覽器資料已超過可安全保存的容量，請先刪除較舊紀錄");
      }
      response.headers.append(
        "Set-Cookie",
        persistentCookie(`${name}_count`, String(chunks.length)),
      );
      chunks.forEach((chunk, index) => {
        response.headers.append("Set-Cookie", persistentCookie(`${name}_${index}`, chunk));
      });
      for (let index = chunks.length; index < Math.min(previousCount, MAX_COOKIE_CHUNKS); index += 1) {
        response.headers.append("Set-Cookie", expiredCookie(`${name}_${index}`));
      }
    }
    return response;
  }

  return { read, write, remove, json };
}
