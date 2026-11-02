export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  GOOGLE_CLIENT_IDS: string;
  APPLE_AUDIENCES: string;
  DEV_AUTH: string;
  SESSION_SECRET: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { userId: string };
};

export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 429,
    message: string,
  ) {
    super(message);
  }
}
