// pages/api/admin/regenerate-specific-invoices.js - CORRECTED

import { InvoiceService } from '../../../services/invoiceService'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  
  const { order_ids, admin_key } = req.body
  
  // ✅ FIX: Verify admin key
  if (!admin_key || admin_key !== process.env.ADMIN_REGENERATE_KEY) {
    return res.status(403).json({ error: 'Invalid admin key' })
  }
  
  // ✅ FIX: Validate order_ids array
  if (!Array.isArray(order_ids) || !order_ids.length) {
    return res.status(400).json({ error: 'order_ids array is required and must not be empty' })
  }

  let results = { success: [], failed: [], skipped: [] }
  
  try {
    for (const orderId of order_ids) {
      try {
        // Check if invoice already exists for this order
        const { data: existingInv, error: checkErr } = await supabase
          .from('invoices')
          .select('id, invoice_no, pdf_url')
          .eq('order_id', orderId)
          .single()

        // ✅ FIX: Properly handle "not found" case vs actual errors
        if (checkErr && checkErr.code !== 'PGRST116') {
          // Real error (not "no rows found")
          results.skipped.push({ 
            orderId, 
            reason: `Query error: ${checkErr.message}` 
          })
          continue
        }

        if (!existingInv) {
          // No existing invoice - create new one
          const result = await InvoiceService.createInvoiceFromOrder(
            orderId, 
            'manual_regeneration'
          )
          results.success.push({ 
            orderId, 
            invoiceNo: result.invoiceNo,
            pdfUrl: result.pdfUrl 
          })
        } else {
          // Existing invoice found - delete line items and regenerate
          await supabase
            .from('invoice_items')
            .delete()
            .eq('invoice_id', existingInv.id)

          // Delete the invoice
          const { error: delErr } = await supabase
            .from('invoices')
            .delete()
            .eq('id', existingInv.id)

          if (delErr) {
            results.failed.push({ 
              orderId, 
              error: `Failed to delete existing invoice: ${delErr.message}` 
            })
            continue
          }

          // Regenerate fresh
          const result = await InvoiceService.createInvoiceFromOrder(
            orderId, 
            'manual_regeneration'
          )
          results.success.push({ 
            orderId, 
            invoiceNo: result.invoiceNo,
            pdfUrl: result.pdfUrl,
            regenerated: true 
          })
        }

        // Rate limiting to avoid server overload
        await new Promise(resolve => setTimeout(resolve, 200))
        
      } catch (err) {
        results.failed.push({ 
          orderId, 
          error: err.message || 'Unknown error' 
        })
        console.error(`Failed to regenerate invoice for ${orderId}:`, err)
      }
    }

    return res.status(200).json({ 
      summary: {
        total: order_ids.length,
        successful: results.success.length,
        failed: results.failed.length,
        skipped: results.skipped.length
      },
      details: results,
      timestamp: new Date().toISOString()
    })
    
  } catch (err) {
    console.error('Regeneration process error:', err)
    return res.status(500).json({ 
      error: 'Regeneration process failed',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal error'
    })
  }
}