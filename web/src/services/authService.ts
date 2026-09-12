import type { User } from '@/lib/types';
import { get, post } from './http';
import { AUTH_LOGIN_PATH, AUTH_LOGOUT_PATH, AUTH_ME_PATH } from './apiPath';

export const login = (email: string, password: string) =>
  post<{ user: User }>(AUTH_LOGIN_PATH, { email, password });

export const logout = () => post<void>(AUTH_LOGOUT_PATH);

export const me = () => get<{ user: User }>(AUTH_ME_PATH);
