import { apiClient, invalidateApiCache } from "../lib/api-client";

export type AdminRole = "SYSTEM" | "SALES" | "MANAGER" | "STAFF";

/** Map backend roles → frontend roles stored in photopro_user */
const ROLE_MAP: Record<string, string> = {
  SYSTEM:  "admin-system",
  SALES:   "admin-sales",
  MANAGER: "manager",
  STAFF:   "staff",
};

export function useAdminAuth() {
  const login = async (email: string, password: string) => {
    const data = await apiClient.post<{
      access_token: string;
      role: AdminRole;
      full_name: string;
      employee_code?: string;
    }>("/api/v1/admin/auth/login", { email, password });

    localStorage.setItem("admin_token", data.access_token);
    localStorage.setItem("admin_role",  data.role);
    localStorage.setItem("admin_name",  data.full_name);
    if (data.employee_code)
      localStorage.setItem("admin_employee_code", data.employee_code);

    // Store in photopro_user format so existing DashboardLayout / useAuth hooks still work
    const frontendRole = ROLE_MAP[data.role] ?? "manager";
    localStorage.setItem(
      "photopro_user",
      JSON.stringify({
        username: email,
        role: frontendRole,
        name: data.full_name ?? email.split('@')[0],
        loginTime: new Date().toISOString(),
        rememberMe: false,
      }),
    );

    return data;
  };

  const logout = () => {
    invalidateApiCache();
    ["admin_token", "admin_role", "admin_name", "admin_employee_code", "photopro_user"].forEach(
      (k) => localStorage.removeItem(k),
    );
    window.location.href = "/login";
  };

  const role = localStorage.getItem("admin_role") as AdminRole | null;
  const employeeCode = localStorage.getItem("admin_employee_code");

  const can = {
    viewDashboard:     true,
    viewLocations:     true,                                   // every role (STAFF: assigned only)
    manageLocations:   role === "SYSTEM" || role === "SALES",
    viewOrders:        role === "SYSTEM" || role === "SALES",
    manageStaff:       role === "SYSTEM",
    manageBundles:     role === "SYSTEM" || role === "SALES",
    viewRevenue:       role !== "STAFF",
    viewStaffStats:    true,                                   // every role
    viewAllStaffStats: role !== "STAFF",                      // STAFF sees only own stats
    changeSettings:    role === "SYSTEM",
    deleteFolder:      role === "SYSTEM",
    uploadPhotos:      role === "STAFF",
    // legacy aliases kept so existing pages dont break
    viewStats:        true,
    manageOrders:     role === "SYSTEM" || role === "SALES",
    manageMedia:      role === "SYSTEM" || role === "SALES",
    manageAdmins:     role === "SYSTEM",
  };

  return { login, logout, role, employeeCode, can };
}
