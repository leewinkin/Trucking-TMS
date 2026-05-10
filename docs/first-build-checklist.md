# First Build Checklist

## Phase 1: App Foundation

- Create web app shell
- Add database schema
- Add authentication
- Add roles: admin, customer, accounting
- Add customer account table
- Add customer user table

## Phase 2: Tariffs

- Add tariff rule table
- Add fixed markup rule
- Add percentage markup rule
- Add minimum margin
- Add admin tariff editor
- Add server-side tariff calculation

## Phase 3: Mothership Quote

- Add backend Mothership client
- Add internal `POST /api/quotes`
- Add quote request validation
- Store raw quote response
- Normalize returned rates
- Apply tariff to each rate
- Add customer quote form
- Add quote results screen

## Phase 4: Mothership Booking

- Add internal `POST /api/shipments`
- Add booking confirmation screen
- Call Mothership create shipment endpoint
- Store shipment record
- Store selected rate and quote relationship
- Create draft invoice

## Phase 5: Tracking

- Add internal tracking endpoint
- Call Mothership tracking endpoint
- Store tracking events
- Add customer shipment detail screen
- Add tracking timeline

## Phase 6: Invoices

- Add invoice table
- Generate invoice number
- Show customer invoice list
- Show invoice detail
- Add PDF later

## Phase 7: Future Carrier Expansion

- Add carrier adapter interface
- Add Speedship adapter
- Add Priority1 adapter
- Normalize all carrier quote responses into one internal rate format

## Immediate Decision Needed

Choose the first implementation stack:

- Option A: Next.js full-stack app with API routes and PostgreSQL
- Option B: React frontend plus separate Node/Express backend
- Option C: React frontend plus Supabase backend

Recommended: Option A for fastest MVP, then split services later if needed.

