import mongoose from 'mongoose';
import { Request } from 'express';
import { AgentHttpError } from './agentTypes';

function queryString(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === 'string' ? value.trim() : undefined;
}

export function getQueryString(req: Request, key: string): string | undefined {
  return queryString(req, key);
}

export function parsePageLimit(req: Request) {
  const pageRaw = queryString(req, 'page') || '1';
  const limitRaw = queryString(req, 'limit') || '50';
  const page = Number(pageRaw);
  const limit = Number(limitRaw);

  if (!Number.isInteger(page) || page < 1) {
    throw new AgentHttpError(400, 'VALIDATION_ERROR', 'page must be a positive integer');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AgentHttpError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 100');
  }

  return { page, limit };
}

export function parseDateValue(value: string | undefined, field: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AgentHttpError(400, 'VALIDATION_ERROR', `${field} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AgentHttpError(400, 'VALIDATION_ERROR', `${field} is not a valid date`);
  }

  return value;
}

export function parseDateRange(req: Request) {
  const startDate = parseDateValue(queryString(req, 'startDate'), 'startDate');
  const endDate = parseDateValue(queryString(req, 'endDate'), 'endDate');
  if (startDate && endDate && startDate > endDate) {
    throw new AgentHttpError(400, 'VALIDATION_ERROR', 'startDate must be before or equal to endDate');
  }
  return { startDate, endDate };
}

export function parseObjectId(value: string | undefined, field: string) {
  if (!value || !mongoose.isValidObjectId(value)) {
    throw new AgentHttpError(400, 'VALIDATION_ERROR', `${field} is invalid`);
  }
  return value;
}

export function safeRegex(value: string | undefined) {
  if (!value) return undefined;
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export function sortOptions(req: Request, allowed: Record<string, string>, defaultField: string) {
  const requestedField = getQueryString(req, 'sortBy') || defaultField;
  const field = allowed[requestedField];
  if (!field) {
    throw new AgentHttpError(400, 'VALIDATION_ERROR', `sortBy must be one of: ${Object.keys(allowed).join(', ')}`);
  }
  const requestedOrder = (getQueryString(req, 'sortOrder') || 'desc').toLowerCase();
  if (!['asc', 'desc'].includes(requestedOrder)) {
    throw new AgentHttpError(400, 'VALIDATION_ERROR', 'sortOrder must be asc or desc');
  }
  const direction: 1 | -1 = requestedOrder === 'asc' ? 1 : -1;
  return { [field]: direction };
}

export function pageMetadata(page: number, limit: number, totalItems: number) {
  return {
    page,
    limit,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / limit)),
  };
}
