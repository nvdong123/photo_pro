import { useAsync } from './useAsync';
import { apiClient, invalidateApiCache } from '../lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CurrentCommission {
  staff_id: string;
  staff_name: string | null;
  employee_code: string | null;
  commission_rate: number;
  effective_from: string | null;
}

export interface CommissionHistoryRow {
  id: string;
  staff_id: string;
  commission_rate: number;
  effective_from: string;
  note: string | null;
  created_at: string;
  created_by_name: string | null;
}

export interface SetCommissionRequest {
  commission_rate: number;
  effective_from: string;
  note?: string | null;
}

export interface PayrollItemOut {
  id: string;
  staff_id: string;
  staff_name: string | null;
  employee_code: string | null;
  gross_revenue: number;
  commission_rate: number;
  commission_amount: number;
  status: 'pending' | 'paid';
  paid_at: string | null;
  note: string | null;
}

export type PayrollCycleStatus = 'pending' | 'processing' | 'paid';
export type CycleType = 'weekly' | 'monthly' | 'quarterly';

export interface PayrollCycleOut {
  id: string;
  name: string;
  cycle_type: CycleType;
  start_date: string;
  end_date: string;
  status: PayrollCycleStatus;
  total_amount: number;
  paid_at: string | null;
  note: string | null;
  created_at: string;
  item_count: number;
  paid_count: number;
}

export interface PayrollCycleDetail extends PayrollCycleOut {
  items: PayrollItemOut[];
}

export interface CreatePayrollCycleRequest {
  name: string;
  cycle_type: CycleType;
  start_date: string;
  end_date: string;
  note?: string | null;
}

export interface MyEarnings {
  staff_id: string;
  staff_name: string | null;
  employee_code: string | null;
  commission_rate: number;
  this_month_gross: number;
  this_month_commission: number;
  pending_amount: number;
  total_earned_all_time: number;
}

// ── Commission hooks ──────────────────────────────────────────────────────────

export function useStaffCommission(staffId: string | undefined) {
  return useAsync(
    () =>
      staffId
        ? apiClient.get<CurrentCommission>(`/api/v1/admin/staff/${staffId}/commission`, 0)
        : Promise.resolve(null),
    [staffId],
  );
}

export function useCommissionHistory(staffId: string | undefined) {
  return useAsync(
    () =>
      staffId
        ? apiClient.get<CommissionHistoryRow[]>(
            `/api/v1/admin/staff/${staffId}/commission/history`,
            0,
          )
        : Promise.resolve([] as CommissionHistoryRow[]),
    [staffId],
  );
}

export async function setCommission(staffId: string, body: SetCommissionRequest): Promise<CommissionHistoryRow> {
  const result = await apiClient.post<CommissionHistoryRow>(
    `/api/v1/admin/staff/${staffId}/commission`,
    body,
  );
  invalidateApiCache(`/api/v1/admin/staff/${staffId}/commission`);
  invalidateApiCache(`/api/v1/admin/staff/${staffId}/commission/history`);
  return result;
}

// ── Payroll hooks ─────────────────────────────────────────────────────────────

export function usePayrollCycles(filters?: {
  status?: PayrollCycleStatus | '';
  year?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.year) params.set('year', String(filters.year));
  const qs = params.toString() ? `?${params}` : '';

  return useAsync(
    () => apiClient.get<PayrollCycleOut[]>(`/api/v1/admin/payroll${qs}`, 0),
    [qs],
  );
}

export function usePayrollCycle(id: string | null) {
  return useAsync(
    () =>
      id
        ? apiClient.get<PayrollCycleDetail>(`/api/v1/admin/payroll/${id}`, 0)
        : Promise.resolve(null),
    [id],
  );
}

export async function createPayrollCycle(body: CreatePayrollCycleRequest): Promise<PayrollCycleDetail> {
  const result = await apiClient.post<PayrollCycleDetail>('/api/v1/admin/payroll', body);
  invalidateApiCache('/api/v1/admin/payroll');
  return result;
}

export async function confirmPayrollCycle(id: string): Promise<void> {
  await apiClient.patch(`/api/v1/admin/payroll/${id}/confirm`, {});
  invalidateApiCache('/api/v1/admin/payroll');
  invalidateApiCache(`/api/v1/admin/payroll/${id}`);
}

export async function markPayrollItemPaid(cycleId: string, staffId: string): Promise<void> {
  await apiClient.patch(`/api/v1/admin/payroll/${cycleId}/items/${staffId}`, {});
  invalidateApiCache(`/api/v1/admin/payroll/${cycleId}`);
}

// ── Staff self-service ────────────────────────────────────────────────────────

export function useMyCommission() {
  return useAsync(() => apiClient.get<CurrentCommission>('/api/v1/admin/staff/my-commission', 0));
}

export function useMyEarnings() {
  return useAsync(() => apiClient.get<MyEarnings>('/api/v1/admin/staff/my-earnings', 0));
}
