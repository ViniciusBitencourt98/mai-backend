import type { Request } from 'express';
import type { AuthService } from '../services/auth.service';
import type { AuthSettings } from './settings';

export interface AuthDependencies {
  run<T>(operation: (service: AuthService) => Promise<T>): Promise<T>;
  settings: AuthSettings;
  clientAddress?: (request: Request) => string;
}
