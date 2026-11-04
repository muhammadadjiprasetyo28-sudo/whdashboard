import type { AreaName } from './areas';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN_C3'
  | 'PETUGAS_C3'
  | 'HELPER'
  | 'HQ'
  | 'MP'
  | 'PPIC'
  | 'ADMIN_AREA';

export interface UserSession {
  username: string;
  role: UserRole;
  allowedArea: string; // 'ALL', 'All Cabang', or specific area like 'Jakarta'
  label: string;
  readonly: boolean;
  avatarKicker: string;
  permissions: {
    canSwitchArea: boolean;
    canWriteTransactions: boolean;
    canReconcile: boolean;
    canAccessC3: boolean;
    canViewAudit: boolean;
    canAccessExternalWms: boolean;
  };
}

export function computeUserPermissions(role: UserRole, allowedArea: string, readonly = false): UserSession['permissions'] {
  const isSuper = role === 'SUPER_ADMIN';
  const isHq = role === 'HQ' || allowedArea === 'All Cabang';
  const isC3Admin = role === 'ADMIN_C3';
  const isAreaAdmin = role === 'ADMIN_AREA';

  return {
    canSwitchArea: isSuper || isHq,
    canWriteTransactions: !readonly && allowedArea !== 'All Cabang' && !isHq,
    canReconcile: !readonly && (isSuper || isC3Admin || isAreaAdmin),
    canAccessC3: isSuper || isC3Admin || role === 'PETUGAS_C3' || role === 'HELPER',
    canViewAudit: isSuper || isC3Admin || isHq,
    canAccessExternalWms: isSuper || isC3Admin || isHq || allowedArea === 'All Cabang',
  };
}

export function getRoleBadgeInfo(role: UserRole, allowedArea: string): { label: string; color: string } {
  switch (role) {
    case 'SUPER_ADMIN':
      return { label: 'Super Admin', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'ADMIN_C3':
      return { label: 'Admin C3', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'PETUGAS_C3':
      return { label: 'Petugas C3', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'HELPER':
      return { label: 'Helper Operasional', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'HQ':
      return { label: 'Admin All Cabang (HQ)', color: 'bg-purple-50 text-purple-700 border-purple-200' };
    case 'MP':
      return { label: 'Material Planning (Read-Only)', color: 'bg-slate-100 text-slate-700 border-slate-300' };
    case 'PPIC':
      return { label: 'PPIC (Read-Only)', color: 'bg-slate-100 text-slate-700 border-slate-300' };
    case 'ADMIN_AREA':
      return { label: `Admin ${allowedArea}`, color: 'bg-sky-50 text-sky-700 border-sky-200' };
    default:
      return { label: 'User', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
}
