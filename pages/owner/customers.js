/**
 * CUSTOMER MANAGEMENT PAGE
 * 
 * Recent Updates & Architecture Changes:
 * 1. Decoupling from Global Table:
 *    - This page now interacts primarily with the `restaurant_customers` table.
 *    - Dependency on the global `customers` table has been removed to prevent foreign key constraints and "null value" errors during creation.
 *    - New customers are assigned a random UUID generated locally (crypto.randomUUID()) instead of relying on a trigger or upstream service.
 * 
 * 2. Customer Creation Flow:
 *    - "Save Customer" creates the record in `restaurant_customers`.
 *    - The modal remains open after save, allowing the user to immediately add "Delivery Addresses".
 *    - Address section is disabled until the customer is saved (requires a valid `customer_id`).
 * 
 * 3. UI Enhancements:
 *    - Replaced browser `alert()` calls with a custom `Toast` notification system for a smoother experience.
 *    - "Save Changes" button is disabled if no changes are detected (comparing current state vs original state).
 *    - "System Sync" warning is hidden for slightly better UX on new customers (shows only if order_count > 0).
 *    - Clear Search button styled as a simple black cross (no circle) for cleaner look.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import { getSupabase } from '../../services/supabase'
import { FaUserFriends, FaExchangeAlt, FaSearch, FaEdit, FaTrash, FaInfoCircle, FaUser, FaPhone, FaHistory, FaFileDownload, FaObjectGroup, FaUserSlash, FaBolt, FaEye, FaEyeSlash, FaStar } from 'react-icons/fa'
import Button from '../../components/ui/Button'
import NiceSelect from '../../components/NiceSelect'
import { Fragment } from 'react'
import { useRestaurantProfileConfig } from '../../hooks/useCreateOrderData'

export default function OwnerCustomersPage() {
  const BRAND = {
    orange: '#f97316',
    black: '#111827',
  }

  const supabase = getSupabase()
  const { checking } = useRequireAuth(supabase)
  const { restaurant, loading: restLoading } = useRestaurant()
  const restaurantId = restaurant?.id

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const [segmentFilter, setSegmentFilter] = useState('all') // all, vip, risk, new
  const [expandedKey, setExpandedKey] = useState(null) 
  const [customerOrders, setCustomerOrders] = useState({}) // { [key]: orders[] }
  const [historyLoading, setHistoryLoading] = useState(false)
  const [mergeSelection, setMergeSelection] = useState([]) // list of keys
  const [selectedOrder, setSelectedOrder] = useState(null) // for order detail modal

  const [editData, setEditData] = useState(null) // { originalPhone, originalName, phone, name }
  const [editingAddrId, setEditingAddrId] = useState(null)
  const [editingAddrData, setEditingAddrData] = useState({})
  const [showAddAddrForm, setShowAddAddrForm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null) // the row to delete
  const [showMergeConfirm, setShowMergeConfirm] = useState(false) // toggle custom modal
  const [processing, setProcessing] = useState(false)
  const [viewCustomer, setViewCustomer] = useState(null);
  
  // Loyalty Programs
  const [loyaltyPrograms, setLoyaltyPrograms] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState(null); // { message, onConfirm }

  const { data: profileConfig } = useRestaurantProfileConfig(restaurantId);
  const allowMultipleCustomers = profileConfig?.allow_multiple_customers_per_order === true;

  useEffect(() => {
    if(!restaurantId) return;
    supabase.from('loyalty_programs').select('id, name, is_default').eq('restaurant_id', restaurantId).eq('is_active', true)
      .then(({ data }) => setLoyaltyPrograms(data || []));
  }, [restaurantId, supabase]);
  
  // Toast Notification State
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' }
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
      }),
    []
  )

  const loadCustomers = async () => {
    setError('')
    setLoading(true)
    try {
      // Fetch from the MASTER VIEW (Dynamically calculates Order Count & Loyalty)
      const { data, error } = await supabase
        .from('v_owner_customers')
        .select(`
          customer_id,
          customer_no,
          total_spent,
          order_count,
          loyalty_points,
          total_points_earned,
          total_points_redeemed,
          visit_count,
          last_order_at,
          first_order_at,
          name,
          phone,
          email,
          address,
          age,
          loyalty_program_id,
          created_at
        `)
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (error) throw error

      const finalRows = (data || []).map(r => ({
        customer_id: r.customer_id,
        customer_no: r.customer_no,
        name: r.name || 'Guest',
        phone: r.phone || '',
        displayPhone: r.phone || 'No Phone',
        email: r.email || '',
        address: r.address || '',
        age: r.age || '',
        total_spent: Number(r.total_spent || 0),
        order_count: Number(r.order_count || 0), 
        visit_count: Number(r.visit_count || 0),
        last_order_at: r.last_order_at,
        first_order_at: r.first_order_at,
        loyalty_points: Number(r.loyalty_points || 0), 
        total_points_earned: Number(r.total_points_earned || 0),
        total_points_redeemed: Number(r.total_points_redeemed || 0),
        loyalty_program_id: r.loyalty_program_id,
        key: r.customer_id
      }))

      setRows(finalRows)
      

        



    } catch (e) {
      console.error('loadCustomers error:', e)
      setError(e?.message || 'Failed to load customers')
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async (customer) => {
   setHistoryLoading(true);
   try {
     const key = customer.key;
     const cId = customer.customer_id;
     
     // 1. Fetch Orders 
     // We removed loyalty columns from orders table, so we select standard fields
     let query = supabase
        .from('orders')
        .select('id, created_at, date_ordered, total_amount, total_inc_tax, status, payment_method, is_credit, payment_status')
        .eq('restaurant_id', restaurantId)
        .eq('status', 'completed')
        .in('payment_status', ['paid', 'completed'])
        .or('is_credit.eq.false,is_credit.is.null');
      
      // Match orders by customer_id OR via order_customers junction table
      let directOrders = [];
      let junctionOrders = [];

      if (cId) {
        // 1. Direct customer_id match
        const { data: d1 } = await supabase
          .from('orders')
          .select('id, created_at, date_ordered, total_amount, total_inc_tax, status, payment_method, is_credit, payment_status')
          .eq('restaurant_id', restaurantId)
          .eq('customer_id', cId)
          .eq('status', 'completed')
          .in('payment_status', ['paid', 'completed'])
          .or('is_credit.eq.false,is_credit.is.null')
          .order('created_at', { ascending: false });
        directOrders = d1 || [];

        // 2. Junction table match (when allow_multiple_customers=true, customer_id on order is null)
        const { data: ocLinks } = await supabase
          .from('order_customers')
          .select('order_id')
          .eq('customer_id', cId);
        
        const junctionOrderIds = (ocLinks || []).map(l => l.order_id).filter(Boolean);
        
        if (junctionOrderIds.length > 0) {
          const directIds = new Set(directOrders.map(o => o.id));
          const onlyInJunction = junctionOrderIds.filter(id => !directIds.has(id));
          
          if (onlyInJunction.length > 0) {
            const { data: d2 } = await supabase
              .from('orders')
              .select('id, created_at, date_ordered, total_amount, total_inc_tax, status, payment_method, is_credit, payment_status')
              .eq('restaurant_id', restaurantId)
              .in('id', onlyInJunction)
              .eq('status', 'completed')
              .in('payment_status', ['paid', 'completed'])
              .or('is_credit.eq.false,is_credit.is.null');
            junctionOrders = d2 || [];
          }
        }
      } else {
        setCustomerOrders(prev => ({ ...prev, [key]: [] }));
        return;
      }

      // Merge and sort by created_at descending
      const allOrders = [...directOrders, ...junctionOrders]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

     // 2. Fetch Loyalty Transactions for these orders
     if (allOrders.length === 0) {
        setCustomerOrders(prev => ({ ...prev, [key]: [] }));
        return;
     }
     const orderIds = allOrders.map(o => o.id);
     console.log('[loadHistory] Fetching loyalty for orders:', orderIds);
     
     const { data: loyaltyTx, error: lErr } = await supabase
        .from('loyalty_transactions')
        .select('order_id, points_earned, points_redeemed, amount_value, txn_type, points_delta')
        .in('order_id', orderIds);
     
     if (lErr) {
        console.error('Loyalty fetch error:', lErr);
     } else {
        console.log('[loadHistory] Loyalty transactions found:', loyaltyTx);
     }

     // 3. Merge Loyalty Data into Orders
     const ordersWithLoyalty = allOrders.map(o => {
         // Find transactions for this order
         const txs = (loyaltyTx || []).filter(t => t.order_id === o.id);
         
         console.log(`[loadHistory] Order ${o.id.substring(0, 8)} has ${txs.length} loyalty transactions:`, txs);
         
         // Aggregate if multiple (though distinct earn/redeem usually separate rows)
         // Use points_earned/points_redeemed columns primarily, fallback to points_delta column
         const earned = txs.reduce((sum, t) => {
             const pts = Number(t.points_earned) || (t.txn_type === 'earn' ? Math.abs(Number(t.points_delta) || 0) : 0);
             return sum + pts;
         }, 0);
         
         const used = txs.reduce((sum, t) => {
             const pts = Number(t.points_redeemed) || (t.txn_type === 'redeem' ? Math.abs(Number(t.points_delta) || 0) : 0);
             return sum + pts;
         }, 0);
         
         // For amount used, strictly look at 'redeem' type transactions' amount_value
         const amountUsed = txs.reduce((sum, t) => {
             return t.txn_type === 'redeem' ? sum + (Number(t.amount_value) || 0) : sum;
         }, 0);

         console.log(`[loadHistory] Order ${o.id.substring(0, 8)} loyalty summary: earned=${earned}, used=${used}, amountUsed=${amountUsed}`);

         // For junction-linked orders (multi-customer), split the total evenly
         // junctionOrderIds contains IDs of orders found via order_customers
         const isJunctionOrder = junctionOrders.some(j => j.id === o.id);
         const orderCustomerCount = isJunctionOrder && o.number_of_customers > 1
           ? o.number_of_customers
           : 1;
         const splitAmount = Number(o.total_amount || o.total_inc_tax || 0) / orderCustomerCount;

         return {
             ...o,
             display_amount: splitAmount, // amount attributable to this customer
             loyalty_points_earned: earned,
             loyalty_points_used: used,
             loyalty_amount_used: amountUsed
         };
     });
     
     setCustomerOrders(prev => ({ ...prev, [key]: ordersWithLoyalty }));
   } catch (e) {
     console.error('History Load Error:', e);
   } finally {
     setHistoryLoading(false);
   }
  }

  const toggleOrderExpand = (customer) => {
    if (expandedKey === customer.key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(customer.key);
    if (!customerOrders[customer.key]) {
      loadHistory(customer);
    }
  }

  const handleOrderClick = (order) => {
     // Format items for the modal
     const items = Array.isArray(order.items) ? order.items : [];
     setSelectedOrder({ 
        ...order, 
        items: items.map(it => ({ 
           ...it, 
           name: it.name || it.item_name || 'Item' 
        })) 
     });
  }

  const exportToCSV = () => {
    if (!rows.length) return;
    
    // Base headers
    const headers = ['Name', 'Phone', 'Visits', 'Total Orders', 'Total Spent', 'Last Visited'];
    
    // Add Age if config is on
    if (allowMultipleCustomers) {
      headers.push('Age');
    }

    const csvRows = [
      headers.join(','),
      ...rows.map(r => {
        const rowData = [
          `"${r.name}"`,
          `"${r.phone || 'No Phone'}"`,
          r.visit_count,
          r.order_count,
          r.total_spent.toFixed(2),
          r.last_order_at ? new Date(r.last_order_at).toLocaleDateString() : ''
        ];
        
        if (allowMultipleCustomers) {
          rowData.push(`"${r.age || ''}"`);
        }
        
        return rowData.join(',');
      })
    ];
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `customers_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const handleMerge = () => {
    if (mergeSelection.length !== 2) return showToast('Select exactly 2 customers to merge', 'error');
    setShowMergeConfirm(true);
  }

  const executeMerge = async () => {
    if (mergeSelection.length !== 2) return;
    const c1 = rows.find(r => r.key === mergeSelection[0]);
    const c2 = rows.find(r => r.key === mergeSelection[1]);
    
    // Safety check mostly for hot-reload scenarios
    if (!c1 || !c2) return;
    
    setProcessing(true);
    try {
      // 1. Reassign orders to Target Customer (By ID and Phone)
      const { error: moveErr } = await supabase
        .from('orders')
        .update({ customer_id: c1.customer_id })
        .eq('restaurant_id', restaurantId)
        .or(`customer_id.eq.${c2.customer_id}${c2.phone ? `,customer_phone.eq.${c2.phone}` : ''}`);

      if (moveErr) throw moveErr;

      // 1b. Update junction table
      await supabase
        .from('order_customers')
        .update({ customer_id: c1.customer_id })
        .eq('customer_id', c2.customer_id);

      // 2. Move Loyalty Transactions
      await supabase
        .from('loyalty_transactions')
        .update({ customer_id: c1.customer_id })
        .eq('restaurant_id', restaurantId)
        .eq('customer_id', c2.customer_id);

      // 3. Move Invoices
      await supabase
        .from('invoices')
        .update({ customer_id: c1.customer_id })
        .eq('restaurant_id', restaurantId)
        .eq('customer_id', c2.customer_id);

      // 4. Transfer Stats and Soft Delete Source Customer
      const newCount = (c1.order_count || 0) + (c2.order_count || 0);
      const newSpent = (c1.total_spent || 0) + (c2.total_spent || 0);
      const newVisits = (c1.visit_count || 0) + (c2.visit_count || 0);
      const firstAt = (c1.first_order_at && c2.first_order_at) 
        ? (new Date(c1.first_order_at) < new Date(c2.first_order_at) ? c1.first_order_at : c2.first_order_at)
        : (c1.first_order_at || c2.first_order_at);
      const lastAt = (c1.last_order_at && c2.last_order_at)
        ? (new Date(c1.last_order_at) > new Date(c2.last_order_at) ? c1.last_order_at : c2.last_order_at)
        : (c1.last_order_at || c2.last_order_at);
      
      const { error: updErr } = await supabase
          .from('restaurant_customers')
          .update({ 
             total_spent: newSpent,
             visit_count: newVisits,
             first_order_at: firstAt,
             last_order_at: lastAt,
             updated_at: new Date().toISOString()
          })
          .eq('restaurant_id', restaurantId)
          .eq('customer_id', c1.customer_id);
      
      if (updErr) throw updErr;

      const { error: delErr } = await supabase
          .from('restaurant_customers')
          .update({ is_active: false })
          .eq('restaurant_id', restaurantId)
          .eq('customer_id', c2.customer_id);
          
      if (delErr) throw delErr;

      setMergeSelection([]);
      await loadCustomers();
      setShowMergeConfirm(false); // Close modal
      // alert('Merge Successful!'); // Optional: replaced by visual feedback or toast if available, but removing alert is cleaner
    } catch (e) {
      alert('Merge Failed: ' + e.message); // Keep error alert for now or move to state
    } finally {
      setProcessing(false);
    }
  }

  const startEdit = async (c) => {
    setEditData({ 
      customer_id: c.customer_id,
      originalPhone: c.phone, 
      originalName: c.name, 
      phone: c.phone, 
      name: c.name,
      email: c.email,
      originalEmail: c.email,
      age: c.age || '',
      originalAge: c.age || '',
      order_count: c.order_count || 0,
      loyalty_program_id: c.loyalty_program_id || '', // Load into edit state
      originalLoyaltyId: c.loyalty_program_id || '',
      addresses: []
    });
    setEditingAddrId(null);
    setEditingAddrData({});
    setShowAddAddrForm(false);

    try {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', c.customer_id)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
         setEditData(prev => prev ? ({ ...prev, addresses: data }) : null);
      }
    } catch (e) {
      console.error('Fetch addresses error:', e);
    }
  }

  const startCreateNew = () => {
    setEditData({ 
      customer_id: null,
      originalPhone: '', 
      originalName: '', 
      phone: '', 
      name: '',
      email: '',
      originalEmail: '',
      age: '',
      originalAge: '',
      loyalty_program_id: '', // Default to empty
      addresses: []
    });
    setEditingAddrId(null);
    setEditingAddrData({});
    setShowAddAddrForm(false);
  }

  const handleUpdateCustomer = async (force = false) => {
    if (!editData.name.trim()) return alert('Name is required');
    setProcessing(true);
    try {
      const newPhone = editData.phone?.trim() || null;
      const newName = editData.name?.trim();
      const newAge = editData.age ? parseInt(editData.age, 10) : null;
      
      // Check if this is a new customer or an update
      const isNewCustomer = !editData.customer_id;

      // Validation: Check if another customer already has this phone
      // BLOCK WITH POPUP
      if (newPhone && newPhone !== editData.originalPhone) {
         const duplicate = rows.find(r => r.phone === newPhone && r.customer_id !== editData.customer_id);
         if (duplicate) {
           setDuplicateWarning({
               message: `Another customer already has the phone number ${newPhone}.\n\nPlease use a different number.`,
               subMessage: `Blocking creation/update to prevent accurate duplicate data.`,
               isBlocking: true
           });
           setProcessing(false);
           return;
         }
      }

      // Check for same Name AND Phone (Exact Duplicate) - BLOCK WITH POPUP
      const exactDuplicate = rows.find(r => 
        r.name?.toLowerCase() === newName.toLowerCase() && 
        (r.phone === newPhone) &&
        r.customer_id !== editData.customer_id
      );
      if (exactDuplicate) {
        setDuplicateWarning({
            message: `A customer with this Name and Phone Number already exists.`,
            subMessage: `Please check the existing customer list.`,
            isBlocking: true
        });
        setProcessing(false);
        return;
      }
      
      // Removed "Same Name Only" warning as per user request.



      if (isNewCustomer) {
        // CREATE NEW CUSTOMER - Only in restaurant_customers table
        // Generate unique customer_no
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let customer_no = '';
        for (let i = 0; i < 8; i++) {
          customer_no += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Generate a random UUID for the customer_id (since we aren't using global table)
        const customer_id = crypto.randomUUID(); 

        const { data: newCustomer, error: rcErr } = await supabase
          .from('restaurant_customers')
          .insert({
            restaurant_id: restaurantId,
            customer_id: customer_id, // Explicitly provide the UUID
            customer_no: customer_no,
            name: newName,
            phone: newPhone,
            email: editData.email?.trim() || null,
            address: null,
            age: newAge,
            total_spent: 0,
            visit_count: 0,
            is_active: true,
            loyalty_program_id: editData.loyalty_program_id || null, // Allow explicit null to use system default vs override
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('customer_id')
          .single();

        if (rcErr) throw rcErr;

        // For new customers, keep the modal open and update editData with the new customer ID
        // so they can immediately add delivery addresses
        setEditData({
          ...editData,
          customer_id: customer_id,
          addresses: [],
          originalPhone: newPhone
        });
        await loadCustomers();
        setProcessing(false);
        return; // Don't close the modal
      } else {
        // UPDATE EXISTING CUSTOMER
        // 1. Update orders & invoices table
        const { error: ordErr } = await supabase
          .from('orders')
          .update({
            customer_name: newName,
            customer_phone: newPhone
          })
          .eq('restaurant_id', restaurantId)
          .eq('customer_id', editData.customer_id);
        if (ordErr) throw ordErr;

        const { error: invErr } = await supabase
          .from('invoices')
          .update({
            customer_name: newName
          })
          .eq('restaurant_id', restaurantId)
          .eq('customer_id', editData.customer_id);
        if (invErr) throw invErr;

        // 2. Also update the master credit customers table if a record exists
        if (editData.originalPhone) {
           await supabase.from('credit_customers').update({
             name: newName,
             phone: newPhone
           }).eq('phone', editData.originalPhone).eq('restaurant_id', restaurantId);
        }

        // 3. Update restaurant_customers (Primary Source)
        // Use the first address as the legacy string if exists
        const primaryAddr = editData.addresses?.find(a => a.is_default) || editData.addresses?.[0];
        const addrString = primaryAddr ? 
          `${primaryAddr.line1}${primaryAddr.line2 ? ', ' + primaryAddr.line2 : ''}, ${primaryAddr.city}${primaryAddr.pincode ? ' (' + primaryAddr.pincode + ')' : ''}`
          : editData.address;

        const { error: rcErr } = await supabase
          .from('restaurant_customers')
          .update({
            name: newName,
            phone: newPhone,
            email: editData.email?.trim() || null,
            address: addrString?.trim() || null,
            age: newAge,
            loyalty_program_id: editData.loyalty_program_id || null, // Update program
            updated_at: new Date().toISOString()
          })
          .eq('restaurant_id', restaurantId)
          .eq('customer_id', editData.customer_id);

        if (rcErr) throw rcErr;


      }

      setEditData(null);
      await loadCustomers();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setProcessing(false);
    }
  }

  const handleAddAddress = async (addr) => {
    if (!addr.line1 || !addr.city) return showToast('House No and City are required', 'error');
    setProcessing(true);
    try {
      if (addr.is_default && editData.addresses.length > 0) {
        // Unset others if this ones default
        await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', editData.customer_id);
      }

      const { data, error } = await supabase
        .from('customer_addresses')
        .insert([{
          customer_id: editData.customer_id,
          line1: addr.line1,
          line2: addr.line2,
          city: addr.city,
          pincode: addr.pincode,
          label: addr.label || 'Home',
          is_default: editData.addresses.length === 0 || !!addr.is_default
        }])
        .select()
        .single();
      
      if (error) throw error;
      setEditData(prev => ({ 
        ...prev, 
        addresses: addr.is_default ? [data, ...prev.addresses.map(a => ({...a, is_default: false}))] : [data, ...prev.addresses] 
      }));
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setProcessing(false);
    }
  }

  const handleDeleteAddress = async (id) => {
     setProcessing(true);
     try {
       const { error } = await supabase
         .from('customer_addresses')
         .delete()
         .eq('id', id);
       if (error) throw error;
       setEditData(prev => ({ ...prev, addresses: prev.addresses.filter(a => a.id !== id) }));
     } catch (e) {
       alert(e.message);
     } finally {
       setProcessing(false);
     }
  }

  const handleSetDefaultAddress = async (addrId) => {
     setProcessing(true);
     try {
        // 1. Unset all other defaults for this customer
        await supabase
           .from('customer_addresses')
           .update({ is_default: false })
           .eq('customer_id', editData.customer_id);
        
        // 2. Set this one as default
        const { error } = await supabase
           .from('customer_addresses')
           .update({ is_default: true })
           .eq('id', addrId);
        
        if (error) throw error;

        // 3. Update local state
        setEditData(prev => ({
           ...prev,
           addresses: prev.addresses.map(a => ({
              ...a,
              is_default: a.id === addrId
           }))
        }));
     } catch (e) {
        alert(e.message);
     } finally {
        setProcessing(false);
     }
  }

  const handleStartEditAddr = (addr) => {
    setEditingAddrId(addr.id);
    setEditingAddrData({ ...addr });
  }

  const handleUpdateAddress = async () => {
    if (!editingAddrData.line1 || !editingAddrData.city) return alert('House No and City are required');
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('customer_addresses')
        .update({
          label: editingAddrData.label,
          line1: editingAddrData.line1,
          line2: editingAddrData.line2,
          city: editingAddrData.city,
          pincode: editingAddrData.pincode
        })
        .eq('id', editingAddrId);
      
      if (error) throw error;

      setEditData(prev => ({
        ...prev,
        addresses: prev.addresses.map(a => a.id === editingAddrId ? { ...a, ...editingAddrData } : a)
      }));
      setEditingAddrId(null);
    } catch (e) {
      alert(e.message);
    } finally {
      setProcessing(false);
    }
  }

  const handleDeleteCustomer = async () => {
    if (!showDeleteConfirm) return;
    setProcessing(true);
    try {
      // Soft Delete: Mark as inactive in consolidated table
      const { error } = await supabase
        .from('restaurant_customers')
        .update({ is_active: false })
        .eq('restaurant_id', restaurantId)
        .eq('customer_id', showDeleteConfirm.customer_id)

      if (error) throw error;

      setShowDeleteConfirm(null);
      await loadCustomers();
    } catch (e) {
      alert(e.message);
    } finally {
      setProcessing(false);
    }
  }

  useEffect(() => {
    if (checking || restLoading || !restaurantId) return
    loadCustomers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, restLoading, restaurantId])

  const filtered = useMemo(() => {
    let base = rows;
    
    // 1. Segmentation
    if (segmentFilter === 'vip') {
        // Top 10% by spend
        const threshold = [...rows].sort((a,b) => b.total_spent - a.total_spent)[Math.floor(rows.length * 0.1)]?.total_spent || 0;
        base = base.filter(r => r.total_spent >= threshold && r.total_spent > 0);
    } else if (segmentFilter === 'risk') {
        // Not seen in 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        base = base.filter(r => new Date(r.last_order_at) < thirtyDaysAgo);
    } else if (segmentFilter === 'new') {
        // Captured in last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        base = base.filter(r => new Date(r.last_order_at) >= sevenDaysAgo);
    }

    // 2. Search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      base = base.filter(r => 
        (r.name || '').toLowerCase().includes(q) ||
        (r.phone || '').includes(q)
      );
    }
    return base;
  }, [rows, segmentFilter, searchQuery]);

  const totalCustomers = rows.length
  const repeatCustomers = rows.filter(r => Number(r.order_count || 0) >= 2).length
  const totalSpent = rows.reduce((s, r) => s + Number(r.total_spent || 0), 0)

  const pageCount = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const pageRows = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  if (checking || restLoading) return <div style={{ padding: 24 }}>Loading…</div>
  if (!restaurantId) return <div style={{ padding: 24 }}>No restaurant</div>

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <h1 className="h1">Customers</h1>
          <p className="subtitle">Track customer visits and lifetime spend</p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <Button 
            onClick={startCreateNew} 
            style={{ 
              background: BRAND.orange, 
              color: '#fff', 
              border: 'none',
              fontWeight: 700,
              boxShadow: `0 4px 12px ${BRAND.orange}40`
            }}
          >
            + Add Customer
          </Button>
          <Button variant="outline" onClick={exportToCSV} title="Export to CSV">
            <FaFileDownload /> Export
          </Button>
          <Button variant="outline" onClick={loadCustomers} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="cr-summary-grid">
        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="kpi-label">Total Customers</span>
              <span className="kpi-value">{totalCustomers}</span>
            </div>
            <div className="kpi-icon"><FaUserFriends /></div>
          </div>
        </div>

        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="kpi-label">Repeat Customers</span>
              <span className="kpi-value">{repeatCustomers}</span>
            </div>
            <div className="kpi-icon"><FaExchangeAlt /></div>
          </div>
        </div>

        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="kpi-label">Total Volume</span>
              <span className="kpi-value" style={{ color: '#059669' }}>{fmt.format(totalSpent)}</span>
            </div>
            <div className="kpi-icon" style={{ color: '#ecfdf5' }}>₹</div>
          </div>
        </div>
      </div>

      <div className="crm-segment-bar">
        <div className="segment-chips">
           <button className={`seg-chip ${segmentFilter === 'all' ? 'active' : ''}`} onClick={() => setSegmentFilter('all')}>All Guests</button>
           <button className={`seg-chip ${segmentFilter === 'vip' ? 'active' : ''}`} onClick={() => setSegmentFilter('vip')}><FaStar /> VIPs</button>
           <button className={`seg-chip ${segmentFilter === 'risk' ? 'active' : ''}`} onClick={() => setSegmentFilter('risk')}><FaUserSlash /> At Risk</button>
           <button className={`seg-chip ${segmentFilter === 'new' ? 'active' : ''}`} onClick={() => setSegmentFilter('new')}><FaBolt /> Recent</button>
        </div>

        {mergeSelection.length > 0 && (
          <div className="merge-toolbar">
             <span>Selected {mergeSelection.length} customer(s)</span>
             {mergeSelection.length === 2 && (
               <Button size="sm" onClick={handleMerge}><FaObjectGroup /> Merge Profiles</Button>
             )}
             <button className="clear-link" onClick={() => setMergeSelection([])}>Cancel Merge</button>
          </div>
        )}
      </div>

      {error && (
        <div style={{
          color: '#b91c1c', marginBottom: 12, padding: 12,
          background: '#fee2e2', border: `1px solid #fecaca`, borderRadius: 10
        }}>{error}</div>
      )}

      <div className="search-bar-premium">
        <FaSearch className="search-icon-svg" />
        <input
          type="text"
          placeholder="Search by name or phone…"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1) }}
          className="search-input-premium"
        />
        {searchQuery && (
          <button className="clear-search-btn-premium" onClick={() => setSearchQuery('')}>✕</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
          No customers found
        </div>
      ) : (
        <>
          {/* Mobile list */}
          <div className="cc-mobile-list">
            {pageRows.map(c => (
              <div key={`${c.phone}-${c.name}`} className="cc-card">
                <div className="cc-row">
                  <div>
                    <div className="cc-name">
                      {c.customer_no && (
                        <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, marginRight: 6, fontWeight: 500 }}>
                          {c.customer_no}
                        </span>
                      )}
                      {c.name}
                    </div>
                    <div className="cc-phone">{c.displayPhone}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                     <Button size="sm" variant="outline" onClick={() => toggleOrderExpand(c)}>
                        {expandedKey === c.key ? <FaEyeSlash /> : <FaEye />}
                     </Button>
                     <Button size="sm" variant="outline" onClick={() => setEditData({ 
                        customer_id: c.customer_id,
                        originalPhone: c.phone, 
                        originalName: c.name, 
                        phone: c.phone, 
                        name: c.name,
                        email: c.email,
                        address: c.address,
                        age: c.age,
                        loyalty_program_id: c.loyalty_program_id || ''
                     })}>
                        Edit
                     </Button>
                     <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(c)}>
                        Del
                     </Button>
                  </div>
                </div>

                <div className="cc-metrics">
                  <div className="cc-metric">
                    <div className="l">Orders</div>
                    <div className="v">{Number(c.order_count || 0)}</div>
                  </div>
                  <div className="cc-metric">
                    <div className="l">Spent</div>
                    <div className="v" style={{ color: BRAND.orange }}>
                      {fmt.format(Number(c.total_spent || 0))}
                    </div>
                  </div>
                  {allowMultipleCustomers && (
                    <div className="cc-metric">
                      <div className="l">Age</div>
                      <div className="v">{c.age || '-'}</div>
                    </div>
                  )}
                </div>

                {expandedKey === c.key && (
                  <div className="cc-orders" style={{ padding: '0 12px 12px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                    {historyLoading && !customerOrders[c.key] ? (
                       <div style={{ textAlign: 'center', padding: 12, fontSize: 13, color: '#64748b' }}>Loading...</div>
                    ) : customerOrders[c.key]?.length ? (
                       customerOrders[c.key].map(o => (
                         <div key={o.id} className="cc-order-row" onClick={() => handleOrderClick(o)} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px dashed #e2e8f0' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                               <span style={{ fontWeight: 800, fontSize: 13 }}>#{o.id.substring(0, 8)}</span>
                               <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(o.date_ordered || o.created_at).toLocaleDateString()}</span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                               <div style={{ fontWeight: 800, fontSize: 13, color: BRAND.orange }}>{fmt.format(o.total_inc_tax || o.total_amount)}</div>
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                                  {o.loyalty_points_earned > 0 && <span style={{ fontSize: 9, fontWeight: 900, color: '#059669', background: '#f0fdf4', padding: '1px 4px', borderRadius: 4 }}>+{o.loyalty_points_earned} PTS</span>}
                                  {o.loyalty_points_used > 0 && <span style={{ fontSize: 9, fontWeight: 900, color: '#ef4444', background: '#fef2f2', padding: '1px 4px', borderRadius: 4 }}>-{o.loyalty_points_used} PTS</span>}
                                  <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>{o.status}</div>
                                </div>
                            </div>
                         </div>
                       ))
                    ) : (
                       <div style={{ textAlign: 'center', padding: 12, color: '#64748b', fontSize: 13 }}>No orders</div>
                    )}
                  </div>
                )}

                <div style={{ padding: 12, fontSize: 12, color: '#6b7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Last visit: {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '-'}</span>
                  <span className="cc-status-badge cc-status-active">
                    {Number(c.visit_count || 0)} visits
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="cr-table-wrap">
            <table className="cr-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Cust #</th>
                  <th>Name</th>
                  <th>Contact</th>
                  <th className="cr-center">Visits</th>
                  <th className="cr-center">Orders</th>
                  {allowMultipleCustomers && <th className="cr-center">Age</th>}
                  <th className="cr-right">Total Spent</th>
                  <th>Last Order</th>
                  <th style={{ textAlign: 'center', width: '160px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c, idx) => (
                  <Fragment key={c.key}>
                     <tr 
                        style={{ background: idx % 2 ? '#fff' : '#f9fafb', cursor: 'pointer' }} 
                        onClick={(e) => {
                           if (e.target.closest('button') || e.target.closest('input')) return;
                           setViewCustomer(c);
                        }}
                     >
                      <td>
                        <input 
                          type="checkbox" 
                          checked={mergeSelection.includes(c.key)}
                          onChange={(e) => {
                              if (e.target.checked) setMergeSelection([...mergeSelection, c.key]);
                              else setMergeSelection(mergeSelection.filter(k => k !== c.key));
                          }}
                        />
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 11, color: '#64748b' }}>
                        {c.customer_no || '-'}
                      </td>
                      <td><strong>{c.name}</strong></td>
                      <td style={{ color: c.phone ? 'inherit' : '#94a3b8' }}>{c.displayPhone}</td>
                      <td className="cr-center">{Number(c.visit_count || 0)}</td>
                      <td className="cr-center">{Number(c.order_count || 0)}</td>
                      {allowMultipleCustomers && <td className="cr-center">{c.age || '-'}</td>}
                      <td className="cr-right" style={{ fontWeight: 800, color: BRAND.orange }}>
                        {fmt.format(Number(c.total_spent || 0))}
                      </td>
                      <td>{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <Button size="sm" variant="outline" title="Show Orders" onClick={() => toggleOrderExpand(c)}>
                              {expandedKey === c.key ? <FaEyeSlash /> : <FaEye />}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => startEdit(c)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(c)}>
                              Del
                            </Button>
                        </div>
                      </td>
                    </tr>

                    {expandedKey === c.key && (
                      <tr>
                        <td colSpan={allowMultipleCustomers ? 10 : 9} style={{ background: '#fff', padding: '12px 24px' }}>
                           <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                 <span style={{ fontWeight: 800, fontSize: 13, color: '#475569' }}>Order History</span>
                                 {historyLoading && !customerOrders[c.key] && <span style={{ fontSize: 11, color: BRAND.orange }}>Fetching...</span>}
                              </div>
                              <div style={{ padding: 0 }}>
                                {customerOrders[c.key]?.length ? (
                                   <table className="cr-table" style={{ fontSize: 12 }}>
                                      <thead>
                                          <tr style={{ background: '#f1f5f9' }}>
                                             <th style={{ background: 'transparent', padding: '10px 16px' }}>Order ID</th>
                                             <th style={{ background: 'transparent', padding: '10px 16px' }}>Date</th>
                                             <th style={{ background: 'transparent', padding: '10px 16px' }}>Amount</th>
                                             <th style={{ background: 'transparent', padding: '10px 16px' }}>Earned</th>
                                             <th style={{ background: 'transparent', padding: '10px 16px' }}>Used</th>
                                             <th style={{ background: 'transparent', padding: '10px 16px' }}>Status</th>
                                          </tr>
                                       </thead>
                                      <tbody>
                                         {customerOrders[c.key].map(o => (
                                            <tr key={o.id} onClick={() => handleOrderClick(o)} className="clickable-order-row">
                                               <td style={{ padding: '10px 16px' }}><strong>#{o.id.substring(0, 8)}</strong></td>
                                               <td style={{ padding: '10px 16px' }}>{new Date(o.date_ordered || o.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</td>
                                               <td style={{ padding: '10px 16px', fontWeight: 700, color: BRAND.orange }}>{fmt.format(o.total_inc_tax || o.total_amount)}</td>
                                                <td style={{ padding: '10px 16px' }}>
                                                   {o.loyalty_points_earned > 0 ? (
                                                      <span style={{ fontWeight: 800, color: '#059669', background: '#f0fdf4', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>
                                                         +{o.loyalty_points_earned}
                                                      </span>
                                                   ) : '-'}
                                                </td>
                                                <td style={{ padding: '10px 16px' }}>
                                                   {o.loyalty_points_used > 0 ? (
                                                      <span style={{ fontWeight: 800, color: '#ef4444', background: '#fef2f2', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>
                                                         -{o.loyalty_points_used}
                                                      </span>
                                                   ) : '-'}
                                                </td>
                                               <td style={{ padding: '10px 16px' }}>
                                                  <span className={`ho-pill ${o.status}`}>{o.status}</span>
                                               </td>
                                            </tr>
                                         ))}
                                      </tbody>
                                   </table>
                                ) : !historyLoading ? (
                                   <div style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>No orders found</div>
                                ) : (
                                   <div style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>Loading...</div>
                                )}
                              </div>
                           </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > itemsPerPage && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24, paddingBottom: 24 }}>
              <Button
                variant="outline"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ fontSize: 13, padding: '8px 16px' }}
              >
                Previous
              </Button>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>
                Page {currentPage} of {pageCount}
              </span>
              <Button
                variant="outline"
                onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
                disabled={currentPage >= pageCount}
                style={{ fontSize: 13, padding: '8px 16px' }}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Selected Order Detailed Modal */}
      {selectedOrder && (
         <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
            <div className="modal-card" style={{ maxWidth: 450 }} onClick={e => e.stopPropagation()}>
               <div className="modal-head">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div className="order-badge">#{selectedOrder.id.substring(0, 8)}</div>
                    <div style={{ fontWeight: 800 }}>Order Details</div>
                  </div>
                  <button className="modal-close" onClick={() => setSelectedOrder(null)}>✕</button>
               </div>
               
               <div className="modal-body" style={{ background: '#fff' }}>
                  <div className="order-item-list">
                    {selectedOrder.items?.map((it, i) => {
                       const grossPrice = Number(it.price || 0);
                       const quantity = Number(it.quantity || 1);
                       const grossTotal = grossPrice * quantity;
                       
                       // Discount logic synchronized with POS
                       const lDisc = Number(it.line_discount_amount || 0);
                       const displayDisc = lDisc > 0 ? lDisc : Math.max(0, Number(it.discount_amount || 0) - Number(it.order_discount_share || 0));

                       return (
                          <div key={i} className="order-detail-row">
                             <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{it.name}</div>
                                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                   {fmt.format(grossPrice)} × {quantity}
                                </div>
                             </div>
                             <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{fmt.format(grossTotal)}</div>
                                {displayDisc > 0 && (
                                   <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>
                                      - {fmt.format(displayDisc)}
                                   </div>
                                )}
                             </div>
                          </div>
                       );
                    })}
                  </div>

                  <div className="order-summary-box">
                    {Number(selectedOrder.total_tax || 0) > 0.01 && (
                       <div className="summary-line">
                          <span>GST {selectedOrder.prices_include_tax ? '(incl)' : ''}</span>
                          <span className="v">{fmt.format(Number(selectedOrder.total_tax || 0))}</span>
                       </div>
                    )}
                     {Number(selectedOrder.discount_amount || 0) > 0 && (
                        <div className="summary-line discount">
                           <span>
                              Bill Discount {selectedOrder.total_discount_percent > 0 ? `(${selectedOrder.total_discount_percent}%)` : ''}
                           </span>
                           <span className="v">- {fmt.format(Number(selectedOrder.discount_amount))}</span>
                        </div>
                     )}
                     {Number(selectedOrder.loyalty_amount_used || 0) > 0 && (
                        <div className="summary-line discount" style={{ color: '#059669' }}>
                           <span>
                              Loyalty Redemption ({selectedOrder.loyalty_points_used || 0} pts)
                           </span>
                           <span className="v">- {fmt.format(Number(selectedOrder.loyalty_amount_used))}</span>
                        </div>
                     )}
                    <div className="summary-line total">
                       <span>Final Total</span>
                       <span className="v">{fmt.format(Number(selectedOrder.total_inc_tax || selectedOrder.total_amount || 0))}</span>
                    </div>

                     {(selectedOrder.loyalty_points_earned > 0 || selectedOrder.loyalty_points_used > 0) && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                           {selectedOrder.loyalty_points_earned > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                 <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>LOYALTY POINTS EARNED</span>
                                 <span style={{ fontSize: 15, fontWeight: 900, color: '#059669' }}>+{selectedOrder.loyalty_points_earned}</span>
                              </div>
                           )}
                           {selectedOrder.loyalty_points_used > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                 <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>LOYALTY POINTS REDEEMED</span>
                                 <span style={{ fontSize: 15, fontWeight: 900, color: '#ef4444' }}>-{selectedOrder.loyalty_points_used}</span>
                              </div>
                           )}
                        </div>
                     )}
                  </div>
               </div>
               
               <div className="modal-foot" style={{ background: '#fafafa' }}>
                  <span className="order-meta-info">Paid via {selectedOrder.is_credit ? 'Credit' : (selectedOrder.payment_method || 'Cash')}</span>
                  <Button variant="outline" onClick={() => setSelectedOrder(null)}>Close</Button>
               </div>
            </div>
         </div>
      )}

      {/* Edit Modal */}
      {editData && (
        <div className="modal-overlay">
            <div className="modal-card" style={{ maxWidth: '500px' }}>
              <div className="modal-head">
                 <h3>{editData.customer_id ? 'Edit Customer Profile' : 'Add New Customer'}</h3>
              </div>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group-premium">
                       <label style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6, display: 'block', letterSpacing: '0.05em' }}>
                          <FaUser style={{ marginRight: 4, color: BRAND.orange }} /> Full Name
                       </label>
                       <input 
                         type="text" 
                         value={editData.name} 
                         onChange={e => setEditData({...editData, name: e.target.value})} 
                         placeholder="e.g. John Doe"
                         style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', transition: 'border 0.2s', background: '#fff' }}
                       />
                    </div>
                    <div className="form-group-premium">
                       <label style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6, display: 'block', letterSpacing: '0.05em' }}>
                          <FaPhone style={{ marginRight: 4, color: BRAND.orange }} /> Phone Number
                       </label>
                       <input 
                         type="tel" 
                         value={editData.phone} 
                         onChange={e => setEditData({...editData, phone: e.target.value})} 
                         placeholder="e.g. 7306806678"
                         style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', transition: 'border 0.2s', background: '#fff' }}
                       />
                    </div>
                 </div>

                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group-premium" style={{ marginTop: 14 }}>
                       <label style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6, display: 'block', letterSpacing: '0.05em' }}>
                          📧 Email Address
                       </label>
                       <input 
                         type="email" 
                         value={editData.email} 
                         onChange={e => setEditData({...editData, email: e.target.value})} 
                         placeholder="e.g. guest@example.com"
                         style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', transition: 'border 0.2s', background: '#fff' }}
                       />
                    </div>
                    <div className="form-group-premium" style={{ marginTop: 14 }}>
                       <label style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6, display: 'block', letterSpacing: '0.05em' }}>
                          🎂 Age
                       </label>
                       <input 
                         type="number" 
                         value={editData.age || ''} 
                         onChange={e => setEditData({...editData, age: e.target.value})} 
                         placeholder="e.g. 25"
                         min="0"
                         max="150"
                         style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', transition: 'border 0.2s', background: '#fff' }}
                       />
                    </div>
                 </div>

                 {/* Loyalty Program Selector */}
                 <div className="form-group-premium" style={{ marginTop: 14 }}>
                    <label style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6, display: 'block', letterSpacing: '0.05em' }}>
                       🏅 Loyalty Program
                    </label>
                    <NiceSelect
                       value={editData.loyalty_program_id || ''}
                       onChange={val => setEditData({...editData, loyalty_program_id: val})}
                       options={[
                          { value: '', label: 'None' },
                          ...(loyaltyPrograms || []).map(p => ({
                             value: p.id,
                             label: `${p.name} ${p.is_default ? '(Default)' : ''}`
                          }))
                       ]}
                       placeholder="Select Loyalty Program..."
                    />
                 </div>

                 {/* Delivery Addresses Section */}
                 <div style={{ marginTop: 24, padding: '16px 0', borderTop: '2px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                       <div>
                          <div style={{ fontWeight: 900, fontSize: 14, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                             Delivery Addresses
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                             {editData.customer_id ? `${editData.addresses?.length || 0} Saved Locations` : 'Save customer first to add addresses'}
                          </div>
                       </div>
                       {!showAddAddrForm && editData.customer_id && (
                          <button 
                            onClick={() => setShowAddAddrForm(true)}
                            style={{ background: BRAND.orange, color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', boxShadow: `0 4px 10px ${BRAND.orange}40` }}
                          >
                             + ADD NEW
                          </button>
                       )}
                    </div>

                    {/* Address List Premium View */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                       {editData.customer_id && editData.addresses?.length === 0 && !showAddAddrForm && (
                          <div style={{ padding: '20px', textAlign: 'center', background: '#f0fdf4', borderRadius: 12, border: '1.5px solid #86efac', color: '#166534', fontSize: 13 }}>
                             ✅ Customer saved successfully! Now you can add delivery addresses below.
                          </div>
                       )}

                       {(editData.addresses || []).map(addr => {
                          const isEditing = editingAddrId === addr.id;
                          return (
                             <div 
                               key={addr.id} 
                               style={{ 
                                  background: '#fff', border: isEditing ? `2px solid ${BRAND.orange}` : '1.5px solid #f1f5f9', 
                                  borderRadius: 12, padding: 12, transition: 'all 0.2s',
                                  boxShadow: isEditing ? '0 8px 20px rgba(0,0,0,0.06)' : '0 1px 2px rgba(0,0,0,0.02)'
                               }}
                             >
                                {isEditing ? (
                                   <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
                                      {/* Label Field */}
                                      <div style={{ marginBottom: 12 }}>
                                         <label style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4, display: 'block', letterSpacing: '0.05em' }}>
                                            Address Label
                                         </label>
                                         <input 
                                            value={editingAddrData.label} 
                                            onChange={e => setEditingAddrData({...editingAddrData, label: e.target.value})}
                                            placeholder="e.g. Home, Office" 
                                            style={{ padding: '8px 12px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', width: '100%', outline: 'none', transition: 'border 0.2s' }}
                                            onFocus={(e) => e.target.style.borderColor = BRAND.orange}
                                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                         />
                                      </div>

                                      {/* Building/Flat Field */}
                                      <div style={{ marginBottom: 12 }}>
                                         <label style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4, display: 'block', letterSpacing: '0.05em' }}>
                                            Building / Flat No <span style={{ color: BRAND.orange }}>*</span>
                                         </label>
                                         <input 
                                            value={editingAddrData.line1} 
                                            onChange={e => setEditingAddrData({...editingAddrData, line1: e.target.value})}
                                            placeholder="e.g. A-402, Skyline Apartments" 
                                            style={{ padding: '8px 12px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', width: '100%', outline: 'none', transition: 'border 0.2s' }}
                                            onFocus={(e) => e.target.style.borderColor = BRAND.orange}
                                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                         />
                                      </div>

                                      {/* Street/Area Field */}
                                      <div style={{ marginBottom: 12 }}>
                                         <label style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4, display: 'block', letterSpacing: '0.05em' }}>
                                            Street / Area / Landmark
                                         </label>
                                         <input 
                                            value={editingAddrData.line2} 
                                            onChange={e => setEditingAddrData({...editingAddrData, line2: e.target.value})}
                                            placeholder="e.g. MG Road, Near Central Park" 
                                            style={{ padding: '8px 12px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', width: '100%', outline: 'none', transition: 'border 0.2s' }}
                                            onFocus={(e) => e.target.style.borderColor = BRAND.orange}
                                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                         />
                                      </div>

                                      {/* City Field */}
                                      <div style={{ marginBottom: 12 }}>
                                         <label style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4, display: 'block', letterSpacing: '0.05em' }}>
                                            City <span style={{ color: BRAND.orange }}>*</span>
                                         </label>
                                         <input 
                                            value={editingAddrData.city} 
                                            onChange={e => setEditingAddrData({...editingAddrData, city: e.target.value})}
                                            placeholder="e.g. Bangalore" 
                                            style={{ padding: '8px 12px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', width: '100%', outline: 'none', transition: 'border 0.2s' }}
                                            onFocus={(e) => e.target.style.borderColor = BRAND.orange}
                                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                         />
                                      </div>

                                      {/* Pincode Field */}
                                      <div style={{ marginBottom: 16 }}>
                                         <label style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4, display: 'block', letterSpacing: '0.05em' }}>
                                            Pincode
                                         </label>
                                         <input 
                                            value={editingAddrData.pincode} 
                                            onChange={e => setEditingAddrData({...editingAddrData, pincode: e.target.value})}
                                            placeholder="e.g. 560001" 
                                            type="text"
                                            maxLength="6"
                                            style={{ padding: '8px 12px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', width: '100%', outline: 'none', transition: 'border 0.2s' }}
                                            onFocus={(e) => e.target.style.borderColor = BRAND.orange}
                                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                         />
                                      </div>

                                      {/* Action Buttons */}
                                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1.5px solid #f1f5f9' }}>
                                         <button 
                                            onClick={() => setEditingAddrId(null)}
                                            style={{ border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', padding: '8px 16px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}
                                         >
                                            CANCEL
                                         </button>
                                         <button 
                                            onClick={handleUpdateAddress}
                                            style={{ border: 'none', background: BRAND.orange, color: '#fff', padding: '8px 20px', borderRadius: 8, fontSize: 11, fontWeight: 900, cursor: 'pointer', boxShadow: `0 4px 12px ${BRAND.orange}40`, transition: 'all 0.2s' }}
                                         >
                                            SAVE
                                         </button>
                                      </div>
                                   </div>
                                ) : (
                                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                      <div style={{ flex: 1 }}>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span style={{ fontWeight: 800, fontSize: 12, color: '#1e293b', textTransform: 'uppercase' }}>{addr.label}</span>
                                            {addr.is_default && (
                                               <span style={{ 
                                                  fontSize: 8, background: `linear-gradient(135deg, ${BRAND.orange} 0%, #fb923c 100%)`, 
                                                  color: '#fff', padding: '2px 6px', borderRadius: 99, fontWeight: 900, 
                                                  boxShadow: `0 2px 6px ${BRAND.orange}40`, letterSpacing: '0.02em'
                                               }}>
                                                  DEFAULT
                                               </span>
                                            )}
                                         </div>
                                         <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, maxWidth: '85%' }}>
                                            {addr.line1}{addr.line2 ? ', ' + addr.line2 : ''}<br/>
                                            {addr.city}, {addr.pincode}
                                         </div>
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                         {!addr.is_default && (
                                            <button 
                                               onClick={() => handleSetDefaultAddress(addr.id)}
                                               style={{ border: 'none', background: '#fffbeb', color: '#d97706', padding: 8, borderRadius: 8, cursor: 'pointer', display: 'flex' }}
                                               title="Set as Default"
                                            >
                                               <FaStar size={12} />
                                            </button>
                                         )}
                                         <button 
                                            onClick={() => handleStartEditAddr(addr)}
                                            style={{ border: 'none', background: '#f8fafc', color: '#64748b', padding: 8, borderRadius: 8, cursor: 'pointer', display: 'flex' }}
                                            title="Edit Address"
                                         >
                                            <FaEdit size={12} />
                                         </button>
                                         <button 
                                            onClick={() => handleDeleteAddress(addr.id)}
                                            style={{ border: 'none', background: '#fef2f2', color: '#ef4444', padding: 8, borderRadius: 8, cursor: 'pointer', display: 'flex' }}
                                            title="Delete Address"
                                         >
                                            <FaTrash size={12} />
                                         </button>
                                      </div>
                                   </div>
                                )}
                             </div>
                          );
                       })}
                    </div>

                    {/* Add New Address Form Section */}
                    {showAddAddrForm && (
                       <div style={{ background: 'linear-gradient(135deg, #fff 0%, #f8fafc 100%)', border: `2px solid ${BRAND.orange}`, borderRadius: 16, padding: 20, animation: 'slideIn 0.2s ease-out', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '2px solid #f1f5f9' }}>
                             <div style={{ fontSize: 14, fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📍 New Delivery Address</div>
                             <button onClick={() => setShowAddAddrForm(false)} style={{ border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', width: 28, height: 28, borderRadius: 8, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                          </div>
                          
                          {/* Label Field */}
                          <div className="form-group-premium" style={{ marginBottom: 16 }}>
                             <label style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block', letterSpacing: '0.05em' }}>
                                Address Label
                             </label>
                             <input 
                                placeholder="e.g. Home, Office, Friend's Place" 
                                id="new_label" 
                                style={{ 
                                   padding: '12px 14px', 
                                   fontSize: 14, 
                                   borderRadius: 10, 
                                   border: '1px solid #e2e8f0', 
                                   width: '100%', 
                                   background: '#fff',
                                   outline: 'none',
                                   transition: 'all 0.2s',
                                   boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                }}
                                onFocus={(e) => e.target.style.borderColor = BRAND.orange}
                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                             />
                          </div>

                          {/* Building/Flat Field */}
                          <div className="form-group-premium" style={{ marginBottom: 16 }}>
                             <label style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block', letterSpacing: '0.05em' }}>
                                Building / Flat No <span style={{ color: BRAND.orange }}>*</span>
                             </label>
                             <input 
                                placeholder="e.g. A-402, Skyline Apartments" 
                                id="new_line1" 
                                style={{ 
                                   padding: '12px 14px', 
                                   fontSize: 14, 
                                   borderRadius: 10, 
                                   border: '1px solid #e2e8f0', 
                                   width: '100%', 
                                   background: '#fff',
                                   outline: 'none',
                                   transition: 'all 0.2s',
                                   boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                }}
                                onFocus={(e) => e.target.style.borderColor = BRAND.orange}
                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                             />
                          </div>

                          {/* Street/Area Field */}
                          <div className="form-group-premium" style={{ marginBottom: 16 }}>
                             <label style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block', letterSpacing: '0.05em' }}>
                                Street / Area / Landmark
                             </label>
                             <input 
                                placeholder="e.g. MG Road, Near Central Park" 
                                id="new_line2" 
                                style={{ 
                                   padding: '12px 14px', 
                                   fontSize: 14, 
                                   borderRadius: 10, 
                                   border: '1px solid #e2e8f0', 
                                   width: '100%', 
                                   background: '#fff',
                                   outline: 'none',
                                   transition: 'all 0.2s',
                                   boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                }}
                                onFocus={(e) => e.target.style.borderColor = BRAND.orange}
                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                             />
                          </div>

                          {/* City Field */}
                          <div className="form-group-premium" style={{ marginBottom: 16 }}>
                             <label style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block', letterSpacing: '0.05em' }}>
                                City <span style={{ color: BRAND.orange }}>*</span>
                             </label>
                             <input 
                                placeholder="e.g. Bangalore" 
                                id="new_city" 
                                style={{ 
                                   padding: '12px 14px', 
                                   fontSize: 14, 
                                   borderRadius: 10, 
                                   border: '1px solid #e2e8f0', 
                                   width: '100%', 
                                   background: '#fff',
                                   outline: 'none',
                                   transition: 'all 0.2s',
                                   boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                }}
                                onFocus={(e) => e.target.style.borderColor = BRAND.orange}
                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                             />
                          </div>

                          {/* Pincode Field */}
                          <div className="form-group-premium" style={{ marginBottom: 20 }}>
                             <label style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block', letterSpacing: '0.05em' }}>
                                Pincode
                             </label>
                             <input 
                                placeholder="e.g. 560001" 
                                id="new_pincode" 
                                type="text"
                                maxLength="6"
                                style={{ 
                                   padding: '12px 14px', 
                                   fontSize: 14, 
                                   borderRadius: 10, 
                                   border: '1px solid #e2e8f0', 
                                   width: '100%', 
                                   background: '#fff',
                                   outline: 'none',
                                   transition: 'all 0.2s',
                                   boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                }}
                                onFocus={(e) => e.target.style.borderColor = BRAND.orange}
                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                             />
                          </div>
                          
                          {/* Actions Row */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 16, borderTop: '2px solid #f1f5f9' }}>
                             <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}>
                                <input type="checkbox" id="add_as_default" style={{ width: 16, height: 16, accentColor: BRAND.orange, cursor: 'pointer' }} />
                                Mark as default
                             </label>
                             <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                   onClick={() => setShowAddAddrForm(false)}
                                   style={{ 
                                      flex: 1,
                                      background: '#fff', 
                                      border: '1.5px solid #e2e8f0', 
                                      color: '#64748b', 
                                      borderRadius: 10, 
                                      padding: '12px 20px', 
                                      fontSize: 13, 
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      transition: 'all 0.2s'
                                   }}
                                >
                                   CANCEL
                                </button>
                                <Button 
                                   onClick={() => {
                                      const l = document.getElementById('new_label').value;
                                      const l1 = document.getElementById('new_line1').value;
                                      const l2 = document.getElementById('new_line2').value;
                                      const c = document.getElementById('new_city').value;
                                      const p = document.getElementById('new_pincode').value;
                                      const isDef = document.getElementById('add_as_default').checked;
                                      handleAddAddress({ label: l, line1: l1, line2: l2, city: c, pincode: p, is_default: isDef });
                                      setShowAddAddrForm(false);
                                   }}
                                   style={{ 
                                      flex: 2,
                                      background: BRAND.orange, 
                                      border: 'none', 
                                      color: '#fff', 
                                      borderRadius: 10, 
                                      padding: '12px 24px', 
                                      fontSize: 13, 
                                      fontWeight: 900,
                                      boxShadow: `0 4px 14px ${BRAND.orange}40`
                                   }}
                                >
                                   SAVE ADDRESS
                                </Button>
                             </div>
                          </div>
                       </div>
                    )}
                 </div>

                 {/* System Sync Warning - Only show for existing customers with history */}
                 {editData.customer_id && (editData.order_count > 0) && (
                 <div className="info-box" style={{ marginTop: 20 }}>
                    <FaInfoCircle className="info-icon" />
                    <div>
                       <div className="info-title">System Sync</div>
                       <p className="info-text">Updating these details will automatically synchronize all historical order records for this guest.</p>
                    </div>
                 </div>
                 )}
              </div>
              <div className="modal-foot">
                 <Button variant="outline" onClick={() => setEditData(null)} disabled={processing}>Cancel</Button>
                  <Button onClick={handleUpdateCustomer} disabled={processing || (editData.customer_id && editData.name === editData.originalName && editData.phone === editData.originalPhone && (editData.email || '') === (editData.originalEmail || '') && (editData.age || '') == (editData.originalAge || '') && (editData.loyalty_program_id || '') === (editData.originalLoyaltyId || ''))}>
                     {processing ? 'Saving...' : (editData.customer_id ? 'Save Changes' : 'Save Customer')}
                  </Button>
              </div>
           </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
           <div className="modal-card" style={{ maxWidth: '400px' }}>
              <div className="modal-head destructive">
                 <h3>Delete Customer?</h3>
              </div>
              <div className="modal-body">
                 <p style={{ fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Are you sure you want to remove <strong>{showDeleteConfirm.name}</strong> from your customer list?</p>
                 
                 <div className="info-box destructive">
                    <FaInfoCircle className="info-icon" />
                    <div>
                       <div className="info-title">Important</div>
                       <p className="info-text">Orders will remain in your reports, but will become anonymous. This action cannot be reversed.</p>
                    </div>
                 </div>
              </div>
              <div className="modal-foot">
                 <Button variant="outline" onClick={() => setShowDeleteConfirm(null)} disabled={processing}>No, Keep</Button>
                 <Button style={{ background: '#dc2626', color: '#fff' }} onClick={handleDeleteCustomer} disabled={processing}>
                    {processing ? 'Deleting...' : 'Yes, Delete'}
                 </Button>
              </div>
           </div>
        </div>
      )}

      {/* Merge Confirmation Modal */}
      {showMergeConfirm && mergeSelection.length === 2 && (
        <div className="modal-overlay" onClick={() => setShowMergeConfirm(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Confirm Merge</h3>
              <button className="modal-close" onClick={() => setShowMergeConfirm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to merge <strong>{rows.find(r => r.key === mergeSelection[1])?.name}</strong> into <strong>{rows.find(r => r.key === mergeSelection[0])?.name}</strong>?
              </p>
              <div className="info-box">
                <span className="info-icon">⚠</span>
                <div>
                  <div className="info-title">Irreversible Action</div>
                  <p className="info-text">
                    All order history from the second customer will be moved to the first. The second profile will then be effectively removed.
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <Button variant="outline" onClick={() => setShowMergeConfirm(false)} disabled={processing}>
                Cancel
              </Button>
              <Button style={{ background: '#f97316', color: 'white', border: 'none' }} onClick={executeMerge} disabled={processing}>
                {processing ? 'Merging...' : 'Confirm Merge'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .subtitle { color: #6b7280; margin: 4px 0 0 0; }

        .cr-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }
        .summary-card {
           background: white;
           padding: 16px 20px;
           border-radius: 12px;
           border: 1px solid #e5e7eb;
           border-top: 4px solid #f97316;
           box-shadow: 0 1px 3px rgba(0,0,0,0.05);
           transition: all 0.2s ease-out;
        }
        .summary-card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }

        .kpi-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.05em; }
        .kpi-value { font-size: 1.5rem; font-weight: 800; color: #1f2937; letter-spacing: -0.02em; }
        .kpi-icon { font-size: 1.25rem; color: #fed7aa; }

        .search-bar-premium {
          display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 9999px; background: #ffffff;
          border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); transition: all 0.25s ease; margin-bottom: 24px;
        }
        .search-bar-premium:focus-within { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1); }
        .search-input-premium { border: none; outline: none; width: 100%; font-size: 14px; }
        .clear-search-btn-premium { 
          background: transparent; border: none; width: 18px; height: 18px; 
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: #000; font-size: 12px; 
        }

        .cr-table-wrap { background: white; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .cr-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .cr-table th {
          background: #fafafa;
          padding: 16px;
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          color: #6b7280;
          font-weight: 700;
          border-bottom: 2px solid #f97316;
          letter-spacing: 0.5px;
          white-space: nowrap;
          position: sticky; top: 0; z-index: 10;
        }
        .cr-table td {
          padding: 16px;
          border-bottom: 1px solid #f3f4f6;
          font-size: 14px;
          color: #374151;
          white-space: nowrap;
          vertical-align: middle;
        }
        .cr-table tr:hover { background: #fff7ed; }
        .cr-right { text-align: right; }
        .cr-center { text-align: center; }
        .cr-table th.cr-right { text-align: right !important; }
        .cr-table th.cr-center { text-align: center !important; }

        .action-btn { 
          width: 32px; height: 32px; border-radius: 8px; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; background: #f1f5f9; color: #64748b;
        }
        .action-btn.edit:hover { background: #fff7ed; color: #f97316; }
        .action-btn.delete:hover { background: #fef2f2; color: #dc2626; }

        .action-btn-mini { border: none; padding: 6px 12px; border-radius: 6px; font-size: 14px; cursor: pointer; }
        .action-btn-mini.edit { background: #fff7ed; color: #f97316; }
        .action-btn-mini.delete { background: #fef2f2; color: #dc2626; }

        /* Modal Styles */
        .modal-overlay {
           position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(4px); animation: fadeIn 0.2s ease-out;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-card {
           background: #fff; width: 90%; max-width: 450px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); overflow: hidden; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .modal-head { 
          padding: 24px 24px; 
          border-bottom: 2px solid #f97316; 
          background: linear-gradient(to bottom, #fff7ed 0%, #ffffff 100%);
          display: flex; justify-content: space-between; align-items: center; 
        }
        .modal-head h3 { margin: 0; font-size: 20px; font-weight: 900; color: #1e293b; letter-spacing: -0.02em; }
        .modal-head.destructive h3 { color: #dc2626; }
        .modal-head.destructive { border-bottom-color: #dc2626; background: linear-gradient(to bottom, #fef2f2 0%, #ffffff 100%); }

        .modal-close { 
          background: #f1f5f9; border: 1px solid #e2e8f0; color: #64748b; 
          width: 32px; height: 32px; border-radius: 10px; font-size: 14px; 
          cursor: pointer; display: flex; align-items: center; justify-content: center; 
          transition: all 0.2s;
        }
        .modal-close:hover { background: #e2e8f0; color: #1e293b; transform: rotate(90deg); }

        .modal-body { padding: 24px; }
        .modal-body p { margin: 0; color: #334155; line-height: 1.5; font-size: 15px; }
        .modal-note { font-size: 11px; color: #94a3b8; font-weight: 600; margin-top: 16px !important; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .info-box { 
           display: flex; gap: 12px; background: #fffcf0; border: 1px solid #fef3c7; padding: 16px; border-radius: 12px; margin-top: 24px; 
        }
        .info-box.destructive { background: #fef2f2; border-color: #fee2e2; }
        .info-icon { font-size: 18px; color: #d97706; margin-top: 2px; }
        .destructive .info-icon { color: #dc2626; }
        .info-title { font-size: 13px; font-weight: 800; color: #92400e; text-transform: uppercase; margin-bottom: 2px; letter-spacing: 0.5px; }
        .destructive .info-title { color: #991b1b; }
        .info-text { font-size: 13px; color: #b45309; line-height: 1.4; font-weight: 500; margin: 0; }
        .destructive .info-text { color: #b91c1c; }
        
        .form-group { margin-bottom: 20px; }
        .form-group label { display: flex; align-items: center; font-size: 11px; font-weight: 800; color: #64748b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.1em; }
        .form-group input { 
          width: 100%; padding: 14px 16px; border: 2px solid #f1f5f9; border-radius: 12px; outline: none; transition: all 0.25s ease; font-size: 15px; font-weight: 600; color: #1e293b;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
        }
        .form-group input:focus { border-color: #f97316; box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1); background: #fff; }
        .form-group input::placeholder { color: #cbd5e1; font-weight: 400; }

        .modal-foot { padding: 20px 24px; background: #f8fafc; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid #f1f5f9; }

        /* CRM Specific */
        .crm-segment-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
        .segment-chips { display: flex; gap: 8px; background: #f1f5f9; padding: 4px; border-radius: 12px; }
        .seg-chip { 
          padding: 8px 16px; border-radius: 10px; border: none; background: transparent; color: #64748b; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; gap: 8px;
        }
        .seg-chip:hover { color: #1e293b; }
        .seg-chip.active { background: white; color: #f97316; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

        .merge-toolbar { 
          background: #fff; border: 1px solid #e2e8f0; padding: 8px 16px; border-radius: 12px; display: flex; align-items: center; gap: 16px; 
          font-size: 13px; font-weight: 700; color: #1e293b; animation: fadeIn 0.3s ease-out; box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .clear-link { background: none; border: none; color: #94a3b8; text-decoration: underline; cursor: pointer; font-size: 12px; transition: color 0.2s; }
        .clear-link:hover { color: #f97316; }

        .ho-pill { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; background: #f1f5f9; color: #64748b; }
        .ho-pill.completed { background: #ecfdf5; color: #059669; }
        .ho-pill.pending { background: #fffbeb; color: #d97706; }
        
        /* Order Details Modal Styles */
        .order-badge { background: #fff7ed; color: #f97316; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 800; border: 1px solid #ffedd5; }
        .order-item-list { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
        .order-detail-row { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 1px dashed #f1f5f9; }
        .order-summary-box { margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 12px; display: flex; flex-direction: column; gap: 8px; }
        .summary-line { display: flex; justify-content: space-between; font-size: 13px; color: #64748b; font-weight: 600; }
        .summary-line.discount { color: #dc2626; }
        .summary-line.total { border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 4px; color: #1e293b; font-size: 16px; font-weight: 800; }
        .summary-line .v { color: #1e293b; }
        .order-meta-info { flex: 1; font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }

        .cc-mobile-list { display: none; }
        .cc-card {
           background: white; border-radius: 12px; border: 1px solid #e5e7eb;
           margin-bottom: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .cc-row { padding: 16px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f3f4f6; }
        .cc-name { font-weight: 800; font-size: 16px; color: #111827; }
        .cc-phone { font-size: 13px; color: #6b7280; margin-top: 2px; }
        .cc-metrics { display: flex; background: #fafafa; }
        .cc-metric { flex: 1; padding: 12px; text-align: center; border-right: 1px solid #f3f4f6; }
        .cc-metric:last-child { border-right: none; }
        .cc-metric .l { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-bottom: 2px; }
        .cc-metric .v { font-size: 14px; font-weight: 800; }

        .cc-status-badge { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
        .cc-status-active { background: #ecfdf5; color: #059669; }



      @media (max-width: 768px) {
          .cc-mobile-list { display: block; }
          .cr-table-wrap { display: none; }
          .cr-summary-grid { grid-template-columns: 1fr; }
          .page-header { flex-direction: column; gap: 8px; align-items: flex-start; }
        }
      `}</style>

      {/* View Customer Details Modal */}
      {viewCustomer && (
        <div className="modal-overlay" onClick={() => setViewCustomer(null)}>
           <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
              <div className="modal-head">
                 <h3>Customer Details</h3>
                 <button className="modal-close" onClick={() => setViewCustomer(null)}>✕</button>
              </div>
              <div className="modal-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                       <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>{viewCustomer.name}</h2>
                       <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          {viewCustomer.customer_no && (
                             <span style={{ fontSize: 11, fontWeight: 700, background: '#f1f5f9', padding: '2px 8px', borderRadius: 6, color: '#64748b' }}>
                                #{viewCustomer.customer_no}
                             </span>
                          )}
                          <span style={{ fontSize: 11, fontWeight: 700, background: BRAND.orange, padding: '2px 8px', borderRadius: 6, color: '#fff' }}>
                             {viewCustomer.loyalty_points || 0} PTS
                          </span>
                       </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                       <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Total Spent</div>
                       <div style={{ fontSize: 22, fontWeight: 900, color: '#059669' }}>{fmt.format(viewCustomer.total_spent || 0)}</div>
                    </div>
                 </div>

                 <div style={{ background: '#f8fafc', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 16, letterSpacing: 0.5 }}>Loyalty Statistics</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                       <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Current Balance</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: BRAND.orange }}>{viewCustomer.loyalty_points || 0}</span>
                       </div>
                       <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e2e8f0', paddingLeft: 12 }}>
                          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Lifetime Earned</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{viewCustomer.total_points_earned || 0}</span>
                       </div>
                       <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e2e8f0', paddingLeft: 12 }}>
                          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Lifetime Used</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>{viewCustomer.total_points_redeemed || 0}</span>
                       </div>
                    </div>
                 </div>

                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                    <div className="info-box" style={{ margin: 0, flexDirection: 'column', gap: 4, background: '#fff', border: '1px solid #f1f5f9' }}>
                       <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>PHONE</span>
                       <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{viewCustomer.phone || '-'}</span>
                    </div>
                    <div className="info-box" style={{ margin: 0, flexDirection: 'column', gap: 4, background: '#fff', border: '1px solid #f1f5f9' }}>
                       <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>EMAIL</span>
                       <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{viewCustomer.email || '-'}</span>
                    </div>
                    <div className="info-box" style={{ margin: 0, flexDirection: 'column', gap: 4, background: '#fff', border: '1px solid #f1f5f9' }}>
                       <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>AGE</span>
                       <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{viewCustomer.age || '-'}</span>
                    </div>
                 </div>
                 
                 <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>ADDRESS</div>
                    <div style={{ padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 14, color: '#475569' }}>
                       {viewCustomer.address || 'No address provided'}
                    </div>
                 </div>

                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, background: '#f8fafc', padding: 12, borderRadius: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                       <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>ORDERS</div>
                       <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{viewCustomer.order_count || 0}</div>
                    </div>
                    <div style={{ textAlign: 'center', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
                       <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>VISITS</div>
                       <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{viewCustomer.visit_count || 0}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                       <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>JOINED</div>
                       <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
                          {viewCustomer.created_at ? new Date(viewCustomer.created_at).toLocaleDateString() : '-'}
                       </div>
                    </div>
                 </div>
              </div>
              <div className="modal-foot">
                 <Button variant="outline" onClick={() => setViewCustomer(null)}>Close</Button>
                 <Button onClick={() => {
                    setEditData({
                        customer_id: viewCustomer.customer_id,
                        originalPhone: viewCustomer.phone, 
                        originalName: viewCustomer.name, 
                        originalEmail: viewCustomer.email,
                        phone: viewCustomer.phone, 
                        name: viewCustomer.name,
                        email: viewCustomer.email,
                        address: viewCustomer.address,
                        // Need extensive field mapping for full edit support? 
                        // Actually the editData structure expects more.
                        // But let's check what 'startEdit' logic was in the code earlier.
                        // Code used: Button onClick={() => setEditData({...})}
                        // I'll replicate that.
                        addresses: viewCustomer.addresses || [] // Fetching logic might differ.
                    });
                    // Actually, the main table uses a full mapping.
                    // Let's use `setEditData` assuming fields are consistent.
                    // But wait, `viewCustomer` stats (loyalty points, etc) are not in editData usually.
                    // Just name/phone/email/address.
                    // Also `viewCustomer` comes from `rows` which doesn't have `addresses`.
                    // The Edit Logic usually re-fetches or uses row data?
                    // The table row edit button (line 746):
                    /*
                     setEditData({ 
                        customer_id: c.customer_id,
                        originalPhone: c.phone, 
                        originalName: c.name, 
                        originalEmail: c.email,
                        phone: c.phone, 
                        name: c.name,
                        email: c.email,
                        address: c.address,
                        addresses: [] // It fetches separately?
                     })
                     */
                     // I will assume `addresses` need to be loaded or are missing.
                     // The edit modal (handleStartEdit?)
                     // Actually line 746 sets it directly.
                     // I will use similar logic.
                    setEditData({ 
                        customer_id: viewCustomer.customer_id,
                        originalPhone: viewCustomer.phone, 
                        originalName: viewCustomer.name, 
                        originalEmail: viewCustomer.email,
                        phone: viewCustomer.phone, 
                        name: viewCustomer.name,
                        email: viewCustomer.email,
                        address: viewCustomer.address,
                        age: viewCustomer.age,
                        loyalty_program_id: viewCustomer.loyalty_program_id || '',
                        originalLoyaltyId: viewCustomer.loyalty_program_id || '',
                        addresses: [] // Will likely need to load.
                     });
                     
                    setViewCustomer(null);
                 }}>
                    <FaEdit /> Edit Profile
                 </Button>
              </div>
           </div>
        </div>
      )}

      {toast && (
        <div style={{
           position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
           background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4',
           border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#22c55e'}`,
           color: toast.type === 'error' ? '#991b1b' : '#14532d',
           padding: '12px 24px', borderRadius: 12,
           boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
           fontWeight: 600, fontSize: 13,
           display: 'flex', alignItems: 'center', gap: 8,
           animation: 'slideIn 0.3s ease-out'
        }}>
           <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: toast.type === 'error' ? '#ef4444' : '#22c55e'
           }} />
           {toast.message}
        </div>
      )}

      {/* Duplicate Warning Modal (Replaces browser confirm) */}
      {duplicateWarning && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'white', padding: 32, borderRadius: 16,
            maxWidth: 400, width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginTop: 0, fontSize: 18, fontWeight: 700, color: '#9a3412', marginBottom: 12 }}>
               Duplicate Name Warning
            </h3>
            <p style={{ color: '#374151', fontSize: 15, marginBottom: 8, whiteSpace: 'pre-line' }}>{duplicateWarning.message}</p>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>{duplicateWarning.subMessage}</p>
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
               {!duplicateWarning.isBlocking && (
                  <Button onClick={() => setDuplicateWarning(null)} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }}>
                     Cancel
                  </Button>
               )}
               {duplicateWarning.isBlocking ? (
                  <Button onClick={() => setDuplicateWarning(null)}>
                     Okay, I'll Change It
                  </Button>
               ) : (
                  <Button onClick={() => { setDuplicateWarning(null); duplicateWarning.onConfirm(); }}>
                     Yes, Proceed
                  </Button>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
