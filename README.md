# Delivery-app 🛒🚚

A full-stack **grocery delivery platform** connecting three types of users: **customers** who place orders, **admins** who manage the store, and **delivery partners** who fulfill orders — with **live tracking** of each order from confirmation to doorstep delivery.

---

## 📋 Table of Contents

- [Business Overview](#business-overview)
- [User Roles](#user-roles)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Auth & Permissions](#auth--permissions)
- [Order Lifecycle](#order-lifecycle)
- [Full API Reference](#full-api-reference)
- [Frontend Breakdown](#frontend-breakdown)
- [Backend Breakdown](#backend-breakdown)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Deployment](#deployment)

---

## Business Overview

This project is an **online grocery/supermarket delivery platform**. It allows a customer to:
- Browse products organized by category (with a dedicated "Organic" tag for premium items)
- View real-time discounted items (Flash Deals)
- Add items to a cart and choose a delivery address with precise GPS coordinates
- Pay either by **Cash on Delivery** or **online via Stripe**
- Track their order status in real time, including **live map tracking** of the delivery partner's location
- Confirm receipt of the order using a **one-time OTP code** given to the delivery partner

Alongside this, there's a full **Admin Dashboard** for managing products, orders, and delivery partners, and a separate **Delivery Partner Dashboard** for managing active deliveries and sharing live location during a delivery run.

---

## User Roles

The app supports **three distinct user types**, each with its own authentication flow:

| Role | How They Log In | Permissions |
|---|---|---|
| **Customer** | Standard signup/login (`/api/auth`) | Browse, order, track, manage own addresses |
| **Admin** | Same login as a customer, but their email is listed in `ADMIN_EMAILS` | Full management of products, orders, and delivery partners |
| **Delivery Partner** | Completely separate login, issuing a JWT with `role: "delivery"` | Receives assigned orders, updates their status, shares live location |

> **Important note:** Admin is **not a separate role stored in the database** — any regular `User` whose email happens to be listed in the `ADMIN_EMAILS` environment variable automatically becomes an admin. This means the permission is resolved from `.env`, not from a column in the `User` table.

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **Node.js + Express 5** | Server and API routing |
| **TypeScript** | End-to-end type safety on the backend |
| **Prisma ORM 7** (with `@prisma/adapter-neon`) | Database access layer (Postgres via Neon, serverless-friendly connection) |
| **PostgreSQL (Neon)** | Primary database |
| **JWT (jsonwebtoken)** | Authentication for all user roles |
| **bcrypt** | Password hashing |
| **Multer + Cloudinary** | Uploading and storing product/user images |
| **Stripe** | Online payment processing + webhook to confirm payment success/failure |
| **Inngest** | Background job processing — stock updates, order-status notifications |
| **Nodemailer** | Sending emails (order confirmations, etc.) |
| **CORS** | Cross-origin access control |

### Frontend
| Technology | Purpose |
|---|---|
| **React + TypeScript** | UI |
| **React Router DOM** | Navigation, including protected routes |
| **Axios** | API communication, with interceptors for JWT injection and session expiry handling |
| **Tailwind CSS** (custom palette: `app-green`, `app-orange`, `app-cream`...) | Styling |
| **Lucide React** | Icons |
| **React Hot Toast** | Success/error notifications |
| **Browser Geolocation API** | Capturing customer address coordinates, and live-tracking the delivery partner |

### Infrastructure
- **Vercel** — hosting for both backend (Serverless Functions via `@vercel/node`) and frontend

---

## Project Structure

```
Delivery-app/
├── server/                       # Backend (Express + TypeScript)
│   ├── server.ts                 # Main entry point
│   ├── config/
│   │   ├── prisma.ts             # Prisma Client + Neon adapter setup
│   │   └── cloudinary.ts         # Image upload configuration
│   ├── controllers/
│   │   ├── authController.ts
│   │   ├── productController.ts
│   │   ├── orderController.ts
│   │   ├── adminController.ts
│   │   └── ...
│   ├── routes/
│   │   ├── authRoutes.ts
│   │   ├── productRoutes.ts
│   │   ├── orderRoutes.ts
│   │   ├── uploadRoutes.ts
│   │   ├── addressRoutes.ts
│   │   ├── adminRoutes.ts
│   │   └── deliveryPartnerRoutes.ts
│   ├── middleware/
│   │   ├── auth.ts               # JWT verification for customers
│   │   ├── admin.ts              # Admin permission check
│   │   └── deliveryAuth.ts       # JWT verification for delivery partners
│   ├── inngest/                  # Background event processing
│   ├── prisma/
│   │   └── schema.prisma         # Database schema
│   └── vercel.json                # Vercel deployment config
│
└── client/                        # Frontend (React + TypeScript)
    └── src/
        ├── pages/                 # Customer pages + admin/ + delivery/
        ├── components/            # Reusable components
        ├── context/                # AuthContext, CartContext
        └── config/api.ts          # Centralized Axios instance
```

---

## Database Schema

The database runs on **PostgreSQL** via **Prisma ORM**, with 5 core models:

### `User`
The standard customer. Holds basic profile data, with relations to their addresses (`Address[]`) and orders (`Order[]`).

### `Address`
A delivery address belonging to a user. Must include **GPS coordinates** (`lat`, `lng`) alongside the textual data (city, state, zip...). A user can mark one address as `isDefault`.

### `Product`
The product, with an original price (`originalPrice`) and a current price (`price`) — the difference between them is calculated dynamically as a discount percentage before being sent to the frontend. Supports an "organic" flag (`isOrganic`) and a rating (`rating`, `reviewCount`).

### `Order`
The order — contains:
- `items` and `shippingAddress` stored as **JSON** (a snapshot at order time, not a direct table relation, so that if a product or address changes later, the historical order stays intact)
- `status` (a simple string like "Placed", "Assigned"...) plus `statusHistory`, a **JSON array** logging every status change with its timestamp and notes (an audit trail)
- `deliveryPartnerId` (optional link to a delivery partner), `deliveryOtp` (the confirmation code used at delivery), and `liveLocation` (the delivery partner's last known location during the order)
- `isPaid` to track actual payment status (relevant for card payments processed through Stripe)

### `DeliveryPartner`
The delivery partner — structured similarly to `User` but as a fully separate entity, with an `isActive` flag for admin-side activation/deactivation, and a relation to all the orders they've handled (`Order[]`).

---

## Auth & Permissions

There are **three separate authentication middleware layers**:

1. **`auth.ts`** — Verifies a valid JWT in the `Authorization: Bearer <token>` header, extracts the user's `id`, and attaches it to `req.user`. Used on every route that requires a logged-in customer.

2. **`admin.ts`** — Runs **after** `auth`. It looks up the user's email (via `req.user.id`) and checks whether it exists in the `ADMIN_EMAILS` environment variable. If matched, it sets `isAdmin: true` on `req.user` and proceeds; otherwise it returns `403 Access denied`.

3. **`deliveryAuth.ts`** — Completely independent of `auth.ts`. It verifies a separate JWT containing `role: "delivery"`, and also confirms the delivery partner's account is currently `isActive` before allowing access.

### On the frontend
- **`AuthContext`** manages the customer/admin login state (persisting the token in `localStorage` under `auth_token`)
- **`ProtectedRoute`** guards pages like the cart, orders, and addresses — redirecting to login if no user is signed in
- **`AdminLayout`** independently checks `user.isAdmin` before rendering any dashboard page
- Delivery partners use a completely separate token (`delivery_token`), stored independently in `localStorage`

---

## Order Lifecycle

An order moves through sequential statuses, each logged in `statusHistory`:

```
Placed → Confirmed → Assigned → Packed → Out for Delivery → Delivered
                                                            ↘ Cancelled
```

1. **Placed** — The customer confirms the order (prices are always recalculated from the database at order time, never trusted from the frontend, to prevent price tampering)
2. **Confirmed / Assigned** — An admin assigns the order to a delivery partner from the dashboard, and a random 6-digit **OTP** is generated for later delivery confirmation
3. **Packed / Out for Delivery** — The delivery partner updates the status themselves from their own dashboard
4. While in transit, if the delivery partner enables "Share Location," their coordinates are continuously sent to the server (via `navigator.geolocation.watchPosition`, plus a periodic fallback every 10 seconds) and displayed on a live map for the customer (`LiveMap`)
5. **Delivered** — Requires the delivery partner to enter the **OTP** held by the customer, confirming an actual, verified handoff (protection against falsely marking a delivery as complete)
6. **Cancelled** — Can be triggered by the delivery partner (with a reason) or automatically if a Stripe payment fails

### Payments
- **Cash on Delivery**: the order is saved directly with status `Placed`
- **Card (Stripe)**: a Checkout Session is created, and afterward a **Stripe Webhook** (`stripeWebhook`) is responsible for:
  - Confirming payment (`isPaid: true`) and decrementing stock upon successful payment
  - Automatically deleting the order if payment fails or is canceled

---

## Full API Reference

Base URL: `/api`

### Auth — `/api/auth`
Login/registration endpoints for customers.

### Products — `/api/products`
| Method | Path | Description | Access |
|---|---|---|---|
| GET | `/flash-deals` | Top 8 discounted products | Public |
| GET | `/` | All products (filterable by category, search, price, sort) | Public |
| GET | `/:id` | Single product details | Public |
| POST | `/` | Create a new product | Admin only |
| PUT | `/:id` | Update a product | Admin only |
| DELETE | `/:id` | Reset stock to zero (soft "out of stock") | Admin only |

### Orders — `/api/orders`
| Method | Path | Description | Access |
|---|---|---|---|
| POST | `/` | Create a new order | Logged-in customer |
| GET | `/` | Current user's orders (optionally filtered by status) | Logged-in customer |
| GET | `/all` | All orders in the system | Admin only |
| GET | `/:id` | Single order details | Logged-in customer (own orders only) |
| PUT | `/:id/status` | Update order status | Admin only |

### Upload — `/api/upload`
Uploads an image (typically a product photo) to Cloudinary via Multer, returning the final image URL.

### Addresses — `/api/addresses`
Full CRUD for a user's delivery addresses; coordinates are automatically captured via the Geolocation API on add/edit.

### Admin — `/api/admin`
Admin dashboard endpoints: overall stats (`getAdminStats`), delivery partner management (`getDeliveryPartners`, `createDeliveryPartner`, `updateDeliveryPartner`), and assigning a delivery partner to an order (`assignDeliveryPartner`).

### Delivery — `/api/delivery`
Delivery-partner-specific endpoints: login, fetching active/completed deliveries, updating order status, updating live location, and completing/canceling a delivery.

### Inngest — `/api/inngest`
A dedicated endpoint for background event processing (stock updates, notifications) — not called directly by the frontend.

### Stripe Webhook
A separate endpoint that receives Stripe payment-status notifications. It requires the **raw request body** (not parsed JSON) for signature verification to work correctly.

---

## Frontend Breakdown

### Customer Pages
- **Home / Products / SearchResults / FlashDeals** — Browsing and discovery
- **ProductPage** — Single product details plus related products
- **Checkout** — Order confirmation and payment method selection
- **MyOrders** — List of the user's orders with status filter tabs (All, Placed, Out for Delivery, Delivered)
- **OrderTracking** — Single order details with a live tracking map, a status timeline, and the OTP
- **Addresses** — Managing delivery addresses

### Admin Dashboard (`/admin`)
- **AdminDashboard** — Overall stats (order count, users, products, out-of-stock items...)
- **AdminProducts / AdminProductForm** — Full product management (add/edit/deactivate)
- **AdminOrders** — Viewing all orders, changing their status, and assigning delivery partners
- **AdminDeliveryPartners** — Onboarding new delivery partners and toggling existing ones active/inactive

### Delivery Partner Dashboard (`/delivery`)
- **DeliveryLogin** — Completely separate login flow
- **DeliveryDashboard** — Active/completed deliveries, status updates, live location sharing, OTP-based delivery completion, or cancellation

### State Management
- **`AuthContext`** — Login state and current user (customer/admin)
- **`CartContext`** — Shopping cart (add, update quantity, remove, clear)
- **`config/api.ts`** — A centralized Axios instance with:
  - An interceptor that automatically injects the JWT into every request
  - A global interceptor for handling 401 responses (auto-logout and redirect to login)

---

## Backend Breakdown

### `server.ts`
The entry point: registers all routers, CORS, the Inngest handler, and a global error-handling middleware. Configured to run both locally (`app.listen`) and on Vercel (serverless, no `listen` call) simultaneously.

### `config/prisma.ts`
Uses `@prisma/adapter-neon` instead of a traditional direct connection, which is better suited to a **serverless** environment (like Vercel) since it manages connections more efficiently across frequent cold starts.

### Controllers
Each controller holds the actual business logic and talks directly to Prisma for database access, consistently returning structured JSON responses (`{ data }` on success, `{ message }` on error).

### `inngest/`
Handles "background" operations that shouldn't block the main API response — such as updating stock after every sale, and sending notifications when an order's status changes.

---

## Environment Variables

Add a `.env` file in the server folder with:

```env
# Database
DATABASE_URL=postgresql://...          # Neon (Postgres) connection string

# Auth
JWT_SECRET=your-secret-key
ADMIN_EMAILS=admin1@example.com,admin2@example.com

# Cloudinary (image uploads)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Stripe (online payments)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Server
PORT=5000
```

And in the frontend's `.env`:
```env
VITE_BASE_URL=http://localhost:5000/api
VITE_CURRENCY_SYMBOL=$
```

> ⚠️ Make sure to use the Cloudinary account's **primary API key** (not a scoped key with a limited role like "Media Library User"), or programmatic uploads will fail.

---

## Running Locally

### Backend
```bash
cd server
npm install
npx prisma generate      # Generate the Prisma Client from the schema
npm run server            # Starts the server with nodemon + tsx on the configured port
```

### Frontend
```bash
cd client
npm install
npm run dev
```

---

## Deployment

The project is configured for deployment on **Vercel**:
- The backend is built as a Serverless Function via `@vercel/node` (defined in `vercel.json`)
- All the environment variables listed above must be added in the Vercel project settings (Settings → Environment Variables), not just in the local `.env`
- The Stripe webhook URL must be registered in the Stripe dashboard after deployment, pointing to the production webhook endpoint

---

## Additional Technical Notes

- **Prices are always recalculated on the server**, never trusted from the frontend, to prevent price tampering when creating an order
- **The `discount` field is not stored in the database** — it's calculated dynamically each time from the difference between `originalPrice` and `price`
- **`items` and `shippingAddress` on an order are stored as JSON snapshots**, not foreign-key relations, so historical order details remain accurate even if the underlying product or address is later changed or deleted
