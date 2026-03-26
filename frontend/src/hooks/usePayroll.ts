import { useState } from 'react';
import { useAsync } from './useAsync';
import { apiClient } from '../lib/api-client';

export type PaymentCycle = 'weekly' | 'monthly' | 'quarterly';
export type PaymentStatus = 'pending' | 'paid';

export interface PendingStaffRow {
  staff_id: string;
  staff_name: string | null;
  employee_code: string | null;
  commission_rate: number;
  gross_revenue: number;
  net_amount: number;
}

export interface StaffPaymentOut {
  id: string;
  staff_id: string;
  staff_name: string | null;
  employee_code: string | null;
  period_start: string;
  period_end: string;
  cycle: PaymentCycle;
  gross_revenue: number;
  commission_rate: number;
  net_amount: number;
  status: PaymentStatus;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface PaginatedPayments {
  items: StaffPaymentOut[];
  total: number;
  page: number;
  limit: number;
}

export interface CreatePayrollRequest {
  period_start: string;
  period_end: string;
  cycle: PaymentCycle;
  staff_ids?: string[];
  notes?: string | null;
}

/** Admin — fetch revenue summary for a date range (no DB writes). */
export function usePendingPayroll(
  periodStart: string | null,
  periodEnd: string | null,
) {
  const enabled = !!(periodStart && periodEnd);
  return useAsync(
    () =>
      enabled
        ? apiClient.get<PendingStaffRow[]>(
            `/api/v1/admin/payroll/pending?period_start=${periodStart}&period_end=${periodEnd}`,
          )
        : Promise.resolve([] as PendingStaffRow[]),
    [periodStart, periodEnd],
  );
}

/** Admin — list existing payment records. */
export function usePayrollPayments(filters: {
  status?: PaymentStatus | '';
  cycle?: PaymentCycle | '';
  staff_id?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.cycle) params.set('cycle', filters.cycle);
  if (filters.staff_id) params.set('staff_id', filters.staff_id);
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 20));

  return useAsync(
    () =>
      apiClient.get<PaginatedPayments>(
        `/api/v1/admin/payroll/payments?${params}`,
      ),
    [params.toString()],
  );
}

/** STAFF — own payment history. */
export function useMyPayments(page = 1) {
  return useAsync(
    () =>
      apiClient.get<PaginatedPayments>(
        `/api/v1/admin/payroll/me?page=${page}`,
      ),
    [page],
  );
}

/** Admin — create payment records for a period. */
export async function createPayments(body: CreatePayrollRequest): Promise<StaffPaymentOut[]> {
  return apiClient.post<StaffPaymentOut[]>('/api/v1/admin/payroll/payments', body);
}

/** Admin — mark a payment record as paid. */
export async function markPaid(paymentId: string, notes?: string): Promise<void> {
  await apiClient.patch(`/api/v1/admin/payroll/payments/${paymentId}/mark-paid`, { notes });
}
