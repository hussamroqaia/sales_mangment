/**
 * company.js
 *
 * Static company (branch) location. Every sales route physically starts from
 * the company, so the route map draws this as the origin point before the
 * first customer stop.
 */

export const COMPANY_NAME = 'الشركة'

export const COMPANY_LATITUDE = 33.360570
export const COMPANY_LONGITUDE = 36.225641

// [lat, lng] — the order Leaflet expects
export const COMPANY_LOCATION = [COMPANY_LATITUDE, COMPANY_LONGITUDE]
