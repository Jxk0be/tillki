import { supabase } from '@/lib/supabase'
import { compressPhoto } from '@/lib/images'
import { uploadWithProgress } from '@/lib/storageUpload'
import { notifyDataChanged } from './useDataChanged'
import type { Database } from '@/types/database'

export type ExpenseCategory = Database['public']['Enums']['expense_category']
export type ExpenseRow = Database['public']['Tables']['expenses']['Row']

export const RECEIPT_BUCKET = 'receipts'

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  supplies: 'Supplies',
  shipping: 'Shipping',
  platform_fees: 'Platform fees',
  event_fees: 'Event fees',
  travel: 'Travel',
  software: 'Software',
  other: 'Other',
}
export const expenseCategories = Object.keys(expenseCategoryLabels) as ExpenseCategory[]

export interface ExpenseInput {
  incurred_at: string
  category: ExpenseCategory
  amount_cents: number
  vendor: string | null
  note: string | null
}

export async function listExpenses(): Promise<ExpenseRow[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('incurred_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data ?? []
}

/** Compresses a receipt photo and stores it at receipts/{expense_id}/{uuid}.{ext}. */
async function uploadReceipt(
  expenseId: string,
  file: File,
  onProgress: (p: number) => void,
): Promise<string> {
  const isPdf = file.type === 'application/pdf'
  const { blob, extension } = isPdf
    ? { blob: file as Blob, extension: 'pdf' }
    : await compressPhoto(file)
  const path = `${expenseId}/${crypto.randomUUID()}.${extension}`
  await uploadWithProgress(RECEIPT_BUCKET, path, blob, onProgress)
  return path
}

export interface SaveExpenseResult {
  id: string
  receiptFailed: boolean
}

export async function createExpense(
  input: ExpenseInput,
  receipt: File | null,
  onProgress: (p: number) => void = () => {},
): Promise<SaveExpenseResult> {
  const { data, error } = await supabase.from('expenses').insert(input).select('id').single()
  if (error) throw error
  notifyDataChanged()
  if (!receipt) return { id: data.id, receiptFailed: false }
  try {
    const path = await uploadReceipt(data.id, receipt, onProgress)
    await supabase.from('expenses').update({ receipt_path: path }).eq('id', data.id)
    return { id: data.id, receiptFailed: false }
  } catch {
    return { id: data.id, receiptFailed: true }
  }
}

export async function updateExpense(
  id: string,
  input: ExpenseInput,
  receipt: File | null,
  previousReceipt: string | null,
  removeReceipt: boolean,
): Promise<{ receiptFailed: boolean }> {
  const { error } = await supabase.from('expenses').update(input).eq('id', id)
  if (error) throw error
  notifyDataChanged()
  let receiptFailed = false
  if (receipt) {
    try {
      const path = await uploadReceipt(id, receipt, () => {})
      await supabase.from('expenses').update({ receipt_path: path }).eq('id', id)
      if (previousReceipt) await supabase.storage.from(RECEIPT_BUCKET).remove([previousReceipt])
    } catch {
      receiptFailed = true
    }
  } else if (removeReceipt && previousReceipt) {
    await supabase.from('expenses').update({ receipt_path: null }).eq('id', id)
    await supabase.storage.from(RECEIPT_BUCKET).remove([previousReceipt])
  }
  return { receiptFailed }
}

export async function deleteExpense(row: ExpenseRow) {
  const { error } = await supabase.from('expenses').delete().eq('id', row.id)
  if (error) throw error
  if (row.receipt_path) await supabase.storage.from(RECEIPT_BUCKET).remove([row.receipt_path])
  notifyDataChanged()
}
