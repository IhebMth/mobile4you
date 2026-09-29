import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Every income/expense source is declared ONCE here.
// Adding a new source later (e.g. phone sales) = one new line, nothing else changes.
const SOURCES = [
  { key: 'repair_income', label: 'مداخيل الصيانة', kind: 'income' },
  { key: 'accessory_sale', label: 'بيع إكسسوارات', kind: 'income' },
  { key: 'phone_sale', label: 'بيع هواتف', kind: 'income' },
  { key: 'debt_collection', label: 'تحصيل ديون الحرفاء', kind: 'income' },
  { key: 'loan_return', label: 'رجوع سلف', kind: 'income' },
  { key: 'repair_part', label: 'مصاريف قطع الغيار', kind: 'expense' },
  { key: 'general', label: 'مصاريف عامة', kind: 'expense' },
  { key: 'loan_out', label: 'سلف من الصندوق', kind: 'expense' },
  { key: 'debt_payment', label: 'تسديد ديون الموردين', kind: 'expense' },
  { key: 'withdrawal', label: 'سحوبات', kind: 'expense' },
]

// rows without a source_type (e.g. withdrawals) fall back to their type
const sourceOf = (t) => t.source_type || t.type

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d
}

export default function DailyReport() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadDay()
  }, [date])

  async function loadDay() {
    setLoading(true)
    setError(null)
    const start = new Date(date + 'T00:00:00').toISOString()
    const end = nextDay(date).toISOString()

    const { data, error: qError } = await supabase
      .from('cash_transactions')
      .select('id, type, source_type, description, amount, created_at, profiles!cash_transactions_performed_by_fkey(full_name)')
      .eq('is_void', false)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: true })

    if (qError) setError(qError.message)
    setTransactions(data || [])
    setLoading(false)
  }

  const breakdown = SOURCES.map((s) => {
    const rows = transactions.filter((t) => sourceOf(t) === s.key)
    return { ...s, total: rows.reduce((sum, t) => sum + Number(t.amount), 0), count: rows.length }
  })

  const incomeRows = breakdown.filter((b) => b.kind === 'income')
  const expenseRows = breakdown.filter((b) => b.kind === 'expense')
  const totalIncome = incomeRows.reduce((s, b) => s + b.total, 0)
  const totalExpense = expenseRows.reduce((s, b) => s + b.total, 0)
  const net = totalIncome - totalExpense

  return (
    <div>
      <div className="flex justify-between items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">التقرير اليومي</h1>
          <p className="text-sm text-[#6b6b6b]">تفصيل المداخيل والمصاريف حسب المصدر</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]"
        />
      </div>

      {error && (
        <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">
          خطأ في التحميل: {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-[#6b6b6b]">جاري التحميل...</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-[#e5e5e5] rounded-xl p-5">
              <p className="text-xs text-[#6b6b6b] mb-1">إجمالي المداخيل</p>
              <p className="text-2xl font-extrabold text-[#1f8a4c]">{totalIncome.toFixed(2)} د.ت</p>
            </div>
            <div className="bg-white border border-[#e5e5e5] rounded-xl p-5">
              <p className="text-xs text-[#6b6b6b] mb-1">إجمالي المصاريف</p>
              <p className="text-2xl font-extrabold text-[#b3170f]">{totalExpense.toFixed(2)} د.ت</p>
            </div>
            <div className="bg-white border border-[#e5e5e5] rounded-xl p-5">
              <p className="text-xs text-[#6b6b6b] mb-1">الصافي</p>
              <p className={`text-2xl font-extrabold ${net >= 0 ? 'text-[#1f8a4c]' : 'text-[#b3170f]'}`}>
                {net.toFixed(2)} د.ت
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <BreakdownCard title="المداخيل حسب المصدر" rows={incomeRows} kind="income" />
            <BreakdownCard title="المصاريف حسب المصدر" rows={expenseRows} kind="expense" />
          </div>

          <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-[#faf9f5] border-b border-[#e5e5e5]">
              <h3 className="text-xs font-bold text-[#6b6b6b]">كل العمليات (بالترتيب الزمني)</h3>
            </div>
            {transactions.length === 0 ? (
              <p className="p-6 text-sm text-[#6b6b6b]">ما فماش عمليات في هذا اليوم</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                    <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الوقت</th>
                    <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">المصدر</th>
                    <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">التفصيل</th>
                    <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">بواسطة</th>
                    <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => {
                    const src = SOURCES.find((s) => s.key === sourceOf(t))
                    const inc = src?.kind === 'income'
                    return (
                      <tr key={t.id} className="hover:bg-[#fbfaf6]">
                        <td className="px-5 py-3 border-b border-[#ececE4] text-xs text-[#6b6b6b]">
                          {new Date(t.created_at).toLocaleTimeString('ar-TN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-5 py-3 border-b border-[#ececE4]">{src?.label || t.type}</td>
                        <td className="px-5 py-3 border-b border-[#ececE4] text-xs text-[#6b6b6b]">
                          {t.description || '—'}
                        </td>
                        <td className="px-5 py-3 border-b border-[#ececE4] text-[#6b6b6b]">
                          {t.profiles?.full_name || '—'}
                        </td>
                        <td
                          className={`px-5 py-3 border-b border-[#ececE4] font-bold ${
                            inc ? 'text-[#1f8a4c]' : 'text-[#b3170f]'
                          }`}
                        >
                          {inc ? '+' : '-'}
                          {Number(t.amount).toFixed(2)} د.ت
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BreakdownCard({ title, rows, kind }) {
  const color = kind === 'income' ? 'text-[#1f8a4c]' : 'text-[#b3170f]'
  const sign = kind === 'income' ? '+' : '-'
  return (
    <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-[#faf9f5] border-b border-[#e5e5e5]">
        <h3 className="text-xs font-bold text-[#6b6b6b]">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-[#ececE4] last:border-0">
              <td className="px-5 py-3">{r.label}</td>
              <td className="px-5 py-3 text-xs text-[#6b6b6b]">{r.count} عملية</td>
              <td className={`px-5 py-3 text-left font-bold ${r.total > 0 ? color : 'text-[#b5b5b5]'}`}>
                {r.total > 0 ? sign : ''}
                {r.total.toFixed(2)} د.ت
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}