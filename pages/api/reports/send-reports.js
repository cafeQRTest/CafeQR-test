// pages/api/reports/send-reports.js

import { getServerSupabase } from '../../../services/supabase-server';
import nodemailer from 'nodemailer';
import { Parser } from 'json2csv';

// ─── helpers ────────────────────────────────────────────────────────
function monthRangeUtc(monthStr) {
    // monthStr = "2026-03"
    const [y, m] = monthStr.split('-').map(Number);
    // IST 00:00 on 1st → UTC (subtract 5:30)
    const startIST = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    startIST.setMinutes(startIST.getMinutes() - 330); // −5h30m
    // IST 23:59:59 on last day → UTC
    const lastDay = new Date(y, m, 0).getDate(); // last day of month
    const endIST = new Date(Date.UTC(y, m - 1, lastDay, 23, 59, 59));
    endIST.setMinutes(endIST.getMinutes() - 330);
    return { startUtc: startIST.toISOString(), endUtc: endIST.toISOString(), lastDay };
}

function prettyMonth(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[m - 1]} ${y}`;
}

// ─── Build Billing / Sales CSV (same as sales.js) ──────────────────
function buildBillingCsv(invoices, reportType) {
    let filtered = (invoices || []).filter(
        inv => String(inv.status || '').toLowerCase() !== 'unpaid'
    );

    const lower = String(reportType || 'all').toLowerCase();
    if (lower === 'sales') {
        filtered = filtered.filter(
            inv => inv.payment_method !== 'credit' && String(inv.status || '').toLowerCase() !== 'void'
        );
    } else if (lower === 'credit') {
        filtered = filtered.filter(
            inv => inv.payment_method === 'credit' && String(inv.status || '').toLowerCase() !== 'void'
        );
    } else if (lower === 'voided') {
        filtered = filtered.filter(
            inv => String(inv.status || '').toLowerCase() === 'void'
        );
    }

    const rows = [];
    for (const inv of filtered) {
        let paymentMethodDisplay = inv.payment_method || 'unknown';
        if (inv.payment_method === 'mixed' && inv.mixed_payment_details) {
            const d = inv.mixed_payment_details || {};
            const cash = Number(d.cash_amount || 0).toFixed(2);
            const onlineAmt = Number(d.online_amount || 0).toFixed(2);
            const onlineMethod = (d.online_method || 'online').toUpperCase();
            paymentMethodDisplay = `Mixed (Cash ${cash} + ${onlineAmt} ${onlineMethod})`;
        }

        const common = {
            'Invoice No': inv.invoice_no,
            'Date & Time': new Date(inv.date_ordered || inv.invoice_date).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true,
            }),
            'Customer Name': inv.customer_name || 'Walk-in',
            'Customer GSTIN': inv.customer_gstin || '',
            'Place of Supply': inv.place_of_supply || '',
            'Payment Method': paymentMethodDisplay,
            'Status': inv.status || 'paid',
            'Void Reason': String(inv.status || '').toLowerCase() === 'void' && inv.regeneration_reason
                ? inv.regeneration_reason.replace(/^void:\s*/i, '') : '',
        };

        const items = inv.invoice_items || [];
        if (!items.length) {
            rows.push({ ...common, 'Line No': '', 'Item Name': '', HSN: '', 'Tax Rate %': '', Qty: '', 'Unit Rate (Ex Tax)': '', 'Line Taxable Value': '', 'CGST Amt': '', 'SGST Amt': '', 'IGST Amt': '', 'Cess %': '', 'Cess Amt': '', 'Line Total Incl Tax': '' });
            continue;
        }

        const isInterState = Number(inv.igst || 0) > 0;
        for (const line of items) {
            const qty = Number(line.qty || 0);
            const unitRateEx = Number(line.unit_rate_ex_tax || 0);
            const lineTaxable = Number(line.line_total_ex_tax || qty * unitRateEx);
            const totalLineTax = Number(line.tax_amount || 0);
            const lineTotalIncTax = Number(line.line_total_inc_tax || lineTaxable + totalLineTax);
            let cgstAmt = 0, sgstAmt = 0, igstAmt = 0;
            if (isInterState) { igstAmt = totalLineTax; }
            else { cgstAmt = Math.round((totalLineTax / 2) * 100) / 100; sgstAmt = cgstAmt; }

            rows.push({
                ...common,
                'Line No': line.line_no,
                'Item Name': (() => {
                    let n = line.item_name || 'Item';
                    if (line.variant_name) { const s = ` (${line.variant_name})`; if (!n.endsWith(s)) n += s; }
                    return n;
                })(),
                HSN: line.hsn || '',
                'Tax Rate %': Number(line.tax_rate || 0).toFixed(2),
                Qty: qty.toFixed(2),
                'Unit Rate (Ex Tax)': unitRateEx.toFixed(2),
                'Line Taxable Value': lineTaxable.toFixed(2),
                'CGST Amt': cgstAmt.toFixed(2),
                'SGST Amt': sgstAmt.toFixed(2),
                'IGST Amt': igstAmt.toFixed(2),
                'Cess %': Number(line.cess_rate || 0).toFixed(2),
                'Cess Amt': Number(line.cess_amount || 0).toFixed(2),
                'Line Total Incl Tax': lineTotalIncTax.toFixed(2),
            });
        }
    }

    const fields = [
        'Invoice No', 'Date & Time', 'Customer Name', 'Customer GSTIN', 'Place of Supply',
        'Line No', 'Item Name', 'HSN', 'Tax Rate %', 'Qty', 'Unit Rate (Ex Tax)',
        'Line Taxable Value', 'CGST Amt', 'SGST Amt', 'IGST Amt', 'Cess %', 'Cess Amt',
        'Line Total Incl Tax', 'Payment Method', 'Status', 'Void Reason',
    ];
    const parser = new Parser({ fields });
    return parser.parse(rows);
}

// ─── Build Expenses & P&L CSV ──────────────────────────────────────
function prettyCsvMethod(m) {
    if (m === 'none' || m === 'unassigned') return 'Other / Not tagged';
    if (m === 'upi') return 'UPI';
    if (m === 'card') return 'Card';
    if (m === 'online') return 'Online';
    if (m === 'cash') return 'Cash';
    if (m === 'credit') return 'Credit';
    if (m === 'unknown') return 'Unknown';
    return m || 'Other';
}

function buildExpensesCsv({ expenses, orders, creditTxns, startUtc, endUtc }) {
    // Calculate summary
    let grossSales = 0, totalTax = 0;
    (orders || []).forEach(o => {
        grossSales += Number(o.total_inc_tax ?? o.total_amount ?? 0);
        totalTax += Number(o.total_tax ?? 0);
    });

    const totalExpenses = (expenses || []).reduce((s, e) => s + Number(e.amount || 0), 0);

    let creditExtended = 0, creditPayments = 0;
    (creditTxns || []).forEach(t => {
        const amt = Number(t.amount || 0);
        if (t.transaction_type === 'credit' || t.transaction_type === 'adjustment') creditExtended += amt;
        else if (t.transaction_type === 'payment') creditPayments += amt;
    });

    // Sales by payment method
    const paymentMap = {};
    (orders || []).forEach(o => {
        let method = o.actual_payment_method || o.payment_method || 'unknown';
        const amount = Number(o.total_inc_tax ?? o.total_amount ?? 0);
        if (method === 'mixed' && o.mixed_payment_details) {
            const { cash_amount, online_amount, online_method } = o.mixed_payment_details || {};
            paymentMap['cash'] = (paymentMap['cash'] || 0) + Number(cash_amount || 0);
            const onlineKey = online_method || 'online';
            paymentMap[onlineKey] = (paymentMap[onlineKey] || 0) + Number(online_amount || 0);
        } else {
            paymentMap[method] = (paymentMap[method] || 0) + amount;
        }
    });

    // Expenses by payment method
    const expMethodMap = {};
    (expenses || []).forEach(e => {
        const m = e.payment_method || 'none';
        expMethodMap[m] = (expMethodMap[m] || 0) + Number(e.amount || 0);
    });

    // Profit by method
    const methodKeys = new Set([...Object.keys(paymentMap), ...Object.keys(expMethodMap)]);
    const profitRows = Array.from(methodKeys).map(m => ({
        method: m,
        sales: paymentMap[m] || 0,
        expenses: expMethodMap[m] || 0,
        profit: (paymentMap[m] || 0) - (expMethodMap[m] || 0),
    })).sort((a, b) => b.profit - a.profit);

    function toCsv(v) {
        if (v == null) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    const rows = [['Date', 'Category', 'Description', 'Payment Method', 'Amount']];

    (expenses || []).forEach(e => {
        const d = new Date(e.expense_date);
        const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
        const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        rows.push([`${date} ${time}`, e.category_name || 'Uncategorized', e.description || '', prettyCsvMethod(e.payment_method), Number(e.amount || 0).toFixed(2)]);
    });

    // Summary section
    rows.push([]);
    rows.push(['Summary']);
    rows.push(['Gross Sales', '', '', '', Number(grossSales).toFixed(2)]);
    rows.push(['Total Tax', '', '', '', Number(totalTax).toFixed(2)]);
    rows.push(['Total Expenses', '', '', '', Number(totalExpenses).toFixed(2)]);
    rows.push(['Net Profit (Accrual)', '', '', '', Number(grossSales - totalExpenses).toFixed(2)]);
    rows.push(['Credit Extended', '', '', '', Number(creditExtended).toFixed(2)]);
    rows.push(['Credit Payments', '', '', '', Number(creditPayments).toFixed(2)]);
    const creditOutstanding = creditExtended - creditPayments;
    rows.push(['Credit Outstanding', '', '', '', Number(creditOutstanding).toFixed(2)]);
    rows.push(['Net Cash Profit', '', '', '', Number(grossSales - totalExpenses - creditOutstanding).toFixed(2)]);

    // Profit by payment method
    rows.push([]);
    rows.push(['Profit by Payment Method']);
    rows.push(['Method', 'Sales', 'Expenses', 'Profit']);
    profitRows.forEach(r => {
        rows.push([prettyCsvMethod(r.method), Number(r.sales).toFixed(2), Number(r.expenses).toFixed(2), Number(r.profit).toFixed(2)]);
    });

    return rows.map(r => r.map(toCsv).join(',')).join('\r\n');
}

// ─── Main handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { restaurant_id, month } = req.body || {};
    if (!restaurant_id || !month) {
        return res.status(400).json({ error: 'restaurant_id and month (YYYY-MM) are required' });
    }

    try {
        const supabase = getServerSupabase();
        const { startUtc, endUtc } = monthRangeUtc(month);

        // 1) Get restaurant details
        const { data: rest, error: restErr } = await supabase
            .from('restaurants')
            .select('name, owner_email')
            .eq('id', restaurant_id)
            .single();
        if (restErr) throw restErr;
        if (!rest?.owner_email) {
            return res.status(400).json({ error: 'Restaurant has no owner email configured' });
        }

        // 2) Fetch invoices for Billing CSVs
        const { data: invoices, error: invErr } = await supabase
            .from('invoices')
            .select(`
        id, invoice_no, date_ordered, invoice_date,
        customer_name, customer_gstin, place_of_supply,
        payment_method, subtotal_ex_tax, total_tax, cgst, sgst, igst,
        total_inc_tax, status, regeneration_reason, mixed_payment_details,
        invoice_items (
          line_no, item_name, variant_name, hsn, qty, unit_rate_ex_tax,
          tax_rate, tax_amount, line_total_ex_tax, line_total_inc_tax,
          cess_rate, cess_amount
        )
      `)
            .eq('restaurant_id', restaurant_id)
            .gte('date_ordered', startUtc)
            .lte('date_ordered', endUtc)
            .order('date_ordered', { ascending: true })
            .order('line_no', { referencedTable: 'invoice_items', ascending: true });
        if (invErr) throw invErr;

        // 3) Fetch expenses
        const { data: expRows, error: expErr } = await supabase
            .from('expenses')
            .select('id, expense_date, amount, description, payment_method, category_id, category:expense_categories(name)')
            .eq('restaurant_id', restaurant_id)
            .gte('expense_date', startUtc)
            .lte('expense_date', endUtc)
            .order('expense_date', { ascending: false });
        if (expErr) throw expErr;

        // Flatten category name
        const expenses = (expRows || []).map(e => ({
            ...e,
            category_name: e.category?.name || 'Uncategorized',
        }));

        // 4) Fetch orders for P&L
        const { data: orders, error: ordErr } = await supabase
            .from('orders')
            .select('total_amount, total_inc_tax, total_tax, payment_method, actual_payment_method, mixed_payment_details, status')
            .eq('restaurant_id', restaurant_id)
            .gte('date_ordered', startUtc)
            .lte('date_ordered', endUtc)
            .neq('status', 'cancelled');
        if (ordErr) throw ordErr;

        // 5) Fetch credit transactions
        const { data: creditTxns, error: txnErr } = await supabase
            .from('credit_transactions')
            .select('transaction_type, amount, transaction_date')
            .eq('restaurant_id', restaurant_id)
            .gte('transaction_date', startUtc)
            .lte('transaction_date', endUtc);
        if (txnErr) throw txnErr;

        // 6) Generate CSVs
        const billingAllCsv = buildBillingCsv(invoices, 'all');
        const billingSalesCsv = buildBillingCsv(invoices, 'sales');
        const expensesCsv = buildExpensesCsv({ expenses, orders, creditTxns, startUtc, endUtc });

        const pretty = prettyMonth(month);
        const restaurantName = rest.name || 'Restaurant';

        // 7) Send email with attachments
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        if (!smtpUser || !smtpPass) {
            return res.status(500).json({ error: 'SMTP credentials not configured' });
        }

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
            from: smtpUser,
            to: rest.owner_email,
            subject: `Monthly Reports for ${pretty} — ${restaurantName}`,
            html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">📊 Monthly Reports</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px;">${restaurantName} — ${pretty}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 16px 16px;">
            <p style="font-size: 15px; color: #374151; line-height: 1.6;">
              Hi there! 👋<br><br>
              Please find attached your monthly reports for <strong>${pretty}</strong>:
            </p>
            <ul style="font-size: 14px; color: #4b5563; line-height: 2;">
              <li><strong>Billing Report (All)</strong> — Complete invoice listing including sales, credit, and void</li>
              <li><strong>Billing Report (Sales Only)</strong> — Paid sales invoices only</li>
              <li><strong>Expenses & P&L Report</strong> — All expenses, summary, and profit breakdown by payment method</li>
            </ul>
            <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
              This report was generated automatically by CafeQR.<br>
              <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://test-cafeqr.vercel.app'}/owner/settings" style="color: #f97316;">Open Settings</a>
            </p>
          </div>
        </div>
      `,
            attachments: [
                { filename: `Billing_All_${month}.csv`, content: billingAllCsv, contentType: 'text/csv' },
                { filename: `Billing_Sales_${month}.csv`, content: billingSalesCsv, contentType: 'text/csv' },
                { filename: `Expenses_PnL_${month}.csv`, content: expensesCsv, contentType: 'text/csv' },
            ],
        });

        return res.status(200).json({ success: true, message: `Reports sent to ${rest.owner_email}` });
    } catch (err) {
        console.error('[send-reports] Error:', err);
        return res.status(500).json({ error: err.message || 'Failed to send reports' });
    }
}
