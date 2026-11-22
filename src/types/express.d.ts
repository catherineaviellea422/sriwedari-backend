import { SessionPayload } from '../types/models';

declare global {
  namespace Express {
    interface Request {
      user?: SessionPayload;
    }
  }
}

export {};
