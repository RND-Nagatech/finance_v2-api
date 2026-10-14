import { Request } from 'express';

type AnyFilter = Record<string, any>;

function cleanValues(values: any[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
        .filter(Boolean)
    )
  );
}

export function normalizeTransactionVisibility(value: any): 'own_only' | 'all' {
  return String(value || '').trim().toLowerCase() === 'own_only' ? 'own_only' : 'all';
}

export function canViewAllTransactions(req: Request): boolean {
  const user = (req as any).user || {};
  const role = String(user.finance_role || user.role || '').toLowerCase();
  return role !== 'finance_input';
}

export function getTransactionOwnerValues(req: Request): string[] {
  const user = (req as any).user || {};
  return cleanValues([
    user.userId,
    user.portal_user_id,
    user.portal_email,
    user.finance_user_id,
    user.id,
    user._id,
    user.sub,
    user.username,
    user.email,
    user.name,
  ]);
}

export function resolveTransactionOwnerId(req: Request): string {
  const user = (req as any).user || {};
  return cleanValues([user.userId, user.portal_user_id, user.id, user._id, user.sub, user.finance_user_id, user.portal_email, user.username, user.email, user.name])[0] || '';
}

export function resolveTransactionActorName(req: Request, fallback?: any): string {
  const user = (req as any).user || {};
  return cleanValues([user.name, user.username, user.email, fallback, user.userId, user.id, user._id])[0] || 'SYSTEM';
}

export function buildTransactionVisibilityFilter(req: Request): AnyFilter | null {
  if (canViewAllTransactions(req)) return null;
  const ownerValues = getTransactionOwnerValues(req);
  if (ownerValues.length === 0) return { _id: '__NO_TRANSACTION_OWNER__' };

  return {
    $or: [
      { input_user_id: { $in: ownerValues } },
      { input_user_id: { $in: [null, ''] }, created_by: { $in: ownerValues } },
      { input_user_id: { $exists: false }, created_by: { $in: ownerValues } },
    ],
  };
}

export function applyTransactionVisibilityFilter(req: Request, filter: AnyFilter): AnyFilter {
  const visibilityFilter = buildTransactionVisibilityFilter(req);
  if (!visibilityFilter) return filter;

  if (filter.$and) {
    filter.$and = [...filter.$and, visibilityFilter];
  } else if (filter.$or) {
    filter.$and = [{ $or: filter.$or }, visibilityFilter];
    delete filter.$or;
  } else {
    Object.assign(filter, visibilityFilter);
  }
  return filter;
}

export function hasTransactionAccess(req: Request, detail: any): boolean {
  if (canViewAllTransactions(req)) return true;
  const ownerValues = new Set(getTransactionOwnerValues(req));
  if (ownerValues.size === 0) return false;

  const inputUserId = detail?.input_user_id ? String(detail.input_user_id).trim() : '';
  if (inputUserId && ownerValues.has(inputUserId)) return true;

  const createdBy = detail?.created_by ? String(detail.created_by).trim() : '';
  return !inputUserId && createdBy ? ownerValues.has(createdBy) : false;
}
