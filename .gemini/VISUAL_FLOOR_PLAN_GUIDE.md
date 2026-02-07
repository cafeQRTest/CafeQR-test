# Visual Floor Plan - How It Works

## ✅ What Happens When You Click a Table

### Step-by-Step:

1. **Click any table** in the visual floor plan
2. **Popover appears** above the table with:
   - Table number & status badge
   - Capacity (number of seats)
   - Section location
   - Current order info (if occupied)

3. **Action Buttons** shown based on table status:

### 🔴 **OCCUPIED Tables** - Show:
- ✅ **Bill** - Print the bill
- ✅ **KOT** - Print Kitchen Order Ticket  
- ✅ **Edit Order** - Modify the current order
- ✅ **Resend QR** - Send QR code to email
- ✅ **Pay & Finish** - Process payment and free table
- ✅ **Edit Table Settings** - Change table configuration

### 🟢 **AVAILABLE Tables** - Show:
- ✅ **Reservation** - Mark as reserved (with note)
- ✅ **Cleaning** - Mark for cleaning
- ✅ **Maintenance** - Mark for maintenance  
- ✅ **Edit Table Settings** - Change configuration

### 🔵 **RESERVED Tables** - Show:
- ✅ **Cancel Reservation** - Make available again
- ✅ **Edit Table Settings** - Change configuration

### 🟠 **CLEANING/MAINTENANCE** - Show:
- ✅ **Finish Cleaning/Maintenance** - Mark as available
- ✅ **Edit Table Settings** - Change configuration

## 🎯 How to Close the Popover

- Click the **X button** in top-right corner
- Click anywhere **outside the popover** (on the backdrop)
- Click any action button (performs action and closes)

## 📱 Responsive Design

- **Desktop**: Popover appears above clicked table with arrow
- **Mobile**: Popover centers on screen (easier to tap)

## 🎨 Current Implementation

The popover is **already implemented and working**! 

Test it by:
1. Go to `/owner/tables`
2. Click the "Visual" button in the toolbar
3. Click any table on the floor plan
4. See all the action options appear!

## Need to Test?

Make sure you have:
- React Query installed: `npm install @tanstack/react-query @tanstack/react-query-devtools`
- Dev server running: `npm run dev`
- Tables created in your database

Then navigate to:
```
http://localhost:3000/owner/tables
```

Click **Visual** → Click any **table** → **Popover shows with all actions!**
