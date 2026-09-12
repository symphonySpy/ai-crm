import type { User } from '@/lib/types';
import { get } from './http';
import { USER_LIST_PATH } from './apiPath';

export const users = () => get<{ rows: User[] }>(USER_LIST_PATH);
