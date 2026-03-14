export interface UserData {
  username: string;
  role: 'admin-system' | 'admin-sales' | 'manager' | 'staff';
  name: string;
  loginTime: string;
  rememberMe: boolean;
}

const ROLE_HIERARCHY: Record<string, number> = {
  'admin-system': 3,
  'admin-sales': 2,
  'manager': 1,
  'staff': 0,
};

export const ROLE_LABELS: Record<string, string> = {
  'admin-system': 'Admin System',
  'admin-sales': 'Admin Sales',
  'manager': 'Manager',
  'staff': 'Nhân viên',
};

export function getUser(): UserData | null {
  try {
    const raw = localStorage.getItem('photopro_user');
    if (!raw) return null;
    return JSON.parse(raw) as UserData;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return getUser() !== null;
}

export function logout() {
  localStorage.removeItem('photopro_user');
}

export function hasRole(requiredRoles: string[]): boolean {
  const user = getUser();
  if (!user) return false;
  return requiredRoles.includes(user.role);
}

export function hasPermission(requiredRole: string): boolean {
  const user = getUser();
  if (!user) return false;
  const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 99;
  return userLevel >= requiredLevel;
}

export function getAvatarInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}
