/**
 * Global utility functions for UI-level formatting.
 * Strictly formats values for presentation layer only.
 */

/**
 * Formats an arbitrary date representation (ISO string, YYYY-MM-DD, or Date object)
 * into 'Month DD, YYYY' format (e.g. June 21, 2026).
 */
export function formatDate(dateVal: any): string {
  if (!dateVal) return 'N/A';
  try {
    // Check if it is a Firestore Timestamp or has .toDate()
    if (typeof dateVal === 'object' && dateVal.toDate && typeof dateVal.toDate === 'function') {
      dateVal = dateVal.toDate();
    }
    
    // If it is a string like "2026-06-21" or "YYYY-MM-DD", parse as local date 
    // to avoid time-zone/UTC shifts from transforming the day
    if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
      const [year, month, day] = dateVal.trim().split('-').map(Number);
      // Month index is 0-based in JS Date constructor
      const localDate = new Date(year, month - 1, day);
      if (!isNaN(localDate.getTime())) {
        return localDate.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        });
      }
    }
    
    const date = new Date(dateVal);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
    return String(dateVal);
  } catch (e) {
    console.error('[Format Date Error]', e);
    return String(dateVal);
  }
}

/**
 * Formats a raw phone string into UI-level standard format: (XXX) XXX-XXXX.
 */
export function formatPhoneNumber(phone: string | undefined | null): string {
  if (!phone) return 'N/A';
  
  // Strip non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  } else if (digits.length > 10) {
    // Last 10 digits as main number, prefix remaining country digits
    const last10 = digits.slice(-10);
    const country = digits.slice(0, -10);
    return `+${country} (${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
  }
  
  return phone;
}
