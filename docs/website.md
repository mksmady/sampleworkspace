# Maddybaba – Website, host sign-up and dashboards

Pages, custom elements and dashboards of the Maddybaba site (phase 10). Design reference: `docs/Homepage — desktop.pdf` (home page). Sign-up and the dashboards have no design yet: they use the home page's style (section 1) and the layouts below; replace them when designs arrive. Data model: `docs/data-model.md`. Search API: `docs/search.md`.

## 1. Style

From the home page design:

- Colours: navy `#14213d` (header, footer, dark bands), deep navy `#0e1830`, orange `#c2531b` (primary buttons, accents), soft orange `#f2a65a` (sun, highlights), cream `#fbf6ec` (page background), sand `#f3e6d0` (alternate bands), white cards, text `#1d2433`, muted `#5b6475`.
- Headings: a serif (Google Fonts "DM Serif Display"); italic orange for the emphasised half ("*Your Whole Trip.*"). Body: "Inter".
- Cards: white, 16 px radius, soft shadow; pill tags; small uppercase eyebrow labels ("LOCAL TRIP HOST", "THE MADDYBABA DIFFERENCE").
- Illustrations: flat mountain/landscape shapes in the palette (inline SVG, no image files), used for host avatars without a photo, destination tiles without a hero image and the hero/closing bands.
- Phone width: everything stacks in one column with 16 px side gutters; no horizontal scroll.

## 2. Pages

All pages are on the Maddybaba site (`/web/maddybaba`), built by `scripts/setup/site.js` through the headless-admin-site API as widget pages (`1_column` layout) holding the elements of section 3, by ERC (`MB_PAGE_<name>`), so a rerun changes nothing.

| Page (friendly URL) | ERC | Elements, top to bottom | Visible to |
|---|---|---|---|
| Home (`/home`) | `MB_PAGE_home` | mb-site-header, mb-hero, mb-host-carousel, mb-destination-tiles, mb-difference, mb-become-host-band, mb-testimonials, mb-journal, mb-closing-cta, mb-site-footer | Anyone |
| Local Hosts (`/hosts`) | `MB_PAGE_hosts` | mb-site-header, mb-host-results, mb-site-footer | Anyone |
| Host (`/host?handle=`) | `MB_PAGE_host` | mb-site-header, mb-host-profile, mb-site-footer | Anyone, hidden from navigation |
| Complete Trips (`/trips`) | `MB_PAGE_trips` | mb-site-header, mb-trip-results, mb-site-footer | Anyone |
| Listing (`/listing?slug=`) | `MB_PAGE_listing` | mb-site-header, mb-listing-detail, mb-site-footer | Anyone, hidden from navigation |
| Become a Host (`/become-a-host`) | `MB_PAGE_become_a_host` | mb-site-header, mb-host-signup, mb-site-footer | Anyone (the form asks guests to sign in) |
| Host Dashboard (`/host-dashboard`) | `MB_PAGE_host_dashboard` | mb-site-header, mb-host-dashboard, mb-site-footer | Members (signed in); hidden from navigation |
| Ops Dashboard (`/ops`) | `MB_PAGE_ops` | mb-site-header, mb-ops-dashboard, mb-site-footer | Ops Admin and Administrator only (page permissions); hidden from navigation |

The header's links: Destinations (`/home#destinations`), Local Hosts (`/hosts`), Complete Trips (`/trips`), Become a Host (`/become-a-host`), and Log in (Liferay sign-in) or, when signed in, the user's name with Host Dashboard (hosts), Ops Dashboard (Ops Admin) and Sign out. Sitemap links in the footer that have no page yet (My Trips, Messages, Travel Journal, About, Help…) point to `#` and are marked "coming soon".

## 3. Custom elements (`client-extensions/mb-web-elements`)

One script and one stylesheet define every element (no build step); each element is its own customElement client extension so it can be placed as a widget. Data comes from mb-search-service (`window.MBConfig.searchURL`, default `http://localhost:58082`), from Liferay's headless APIs with `Liferay.Util.fetch` (session and CSRF token), or from mb-actions-service's user endpoints with `Liferay.OAuth2Client.FromUserAgentApplication('mb-host-portal-oaua')` (section 4).

| Element | Content and data |
|---|---|
| mb-site-header | Logo, links (section 2), sign-in state from `Liferay.ThemeDisplay`; dashboard links from `/o/headless-admin-user/v1.0/my-user-account` (account roles / roles). |
| mb-hero | "Meet your local Baba" pill, "Your Local Host. *Your Whole Trip.*", subline, search bar (Where are you going? with `/search/suggest`, Start date, End date, Guests) → `/hosts?q=&from=&to=&guests=`. |
| mb-host-carousel | "Meet Your Local Hosts": host cards from `/search/hosts?sort=rating&pageSize=8`, previous/next arrows, "Explore All Hosts →" (`/hosts`). |
| Host card (shared) | Verified Host badge, ★ rating · N reviews, role label, "Name — Your{Destination} Local", "Destination, State", quote, specialty tags, "Can arrange your entire trip" (canArrangeEntireTrip), price line ("Complete trips from ₹…" or "From ₹…"), "View Host" → `/host?handle=`. |
| mb-destination-tiles | "Where Do You Want To Go?" (anchor `destinations`): `/o/c/destinations?sort=sortOrder:asc`, tile with illustration, name, "N Hosts", link `/hosts?destination=<slug>`. |
| mb-difference | "THE MADDYBABA DIFFERENCE — One Local. *Your Whole Trip.*": "Booking Everything Separately" (six services, six contacts) vs "With MaddyBaba" (You → Your Local Host → services), "Find My Host" → `/hosts`. Static copy. |
| mb-become-host-band | "Become a MaddyBaba Host." with the five ways to earn and the orange card "Turn Your Local Knowledge Into An Experience." → `/become-a-host`. Static copy. |
| mb-testimonials | "What Travelers Say": `/o/c/reviews?filter=isFeatured eq true and isPublished eq true`, first card highlighted (navy), stars, comment, reviewerName, "reviewerCity → destinationName · Hosted by hostDisplayName". |
| mb-journal | "Discover Somewhere New" with the six Journal Topics (Blogs, data-model.md 8.2) as illustrated tiles; "Read the journal" → `#` until a journal page exists. |
| mb-closing-cta | "Where Are You Going Next?" band: "Find My Local Host" (`/hosts`), "Become a Host". |
| mb-site-footer | Brand line, buttons, sitemap columns (Explore, Destinations, For Guests, For Hosts, MaddyBaba), © line. |
| mb-host-results | `/hosts`: search bar (q, dates, guests), filters (destination, specialty, "can arrange the whole trip", sort), host cards grid, pages; reads its parameters from the URL. |
| mb-host-profile | `/host?handle=`: `/search/hosts/{handle}`: card details, bio, listings (complete trips first, → `/listing?slug=`), published reviews. |
| mb-trip-results | `/trips`: `/search/trips?category=completeTrip` with dates and guests; listing cards. |
| mb-listing-detail | `/listing?slug=`: `/search/listings/{slug}`: title, host card link, description, what's included and add-ons, next 30 days' open dates with places left and price. Booking is not in this phase (payments are stubbed); the page shows "Contact the host" (→ host profile). |
| mb-host-signup | Section 4. |
| mb-host-dashboard | Section 5. |
| mb-ops-dashboard | Section 6. |

## 4. Host sign-up and profile edit (phase 10b)

Hosts have only View on Host (data-model.md 6.2), so sign-up and profile changes go through **mb-actions-service** endpoints for signed-in users, on their own OAuth2 user-agent app **`mb-host-portal-oaua`** (separate from the object-action app, data-model.md 7.1). Each endpoint acts only on the user the token belongs to (JWT subject = Liferay user ID); nothing in the request can name another user or host.

- `GET /host-portal/me` → `{signedIn, host: <the user's Host, public and own fields> | null}`.
- `POST /host-portal/signup` → creates the user's Host (ERC `MB_host_user_<userId>`) with `r_userHost_userId` = the token's user, `hostStatus` pendingVerification, the submitted fields (displayName, handle, hostRole, hostOffers, phone, quote, bio, specialties, destination, commissionRate left empty for Ops, termsAccepted). 409 if the user already has a Host. Liferay's validation rules apply; their messages are returned as `{errors: [{field, message}]}` (400). The Host then goes to Ops review (MB Ops Approval); approval onboards it (data-model.md 7.1).
- `PATCH /host-portal/me` → changes only displayName, hostRole, hostOffers, phone, quote, bio, specialties and destination of the user's own Host. Never hostStatus, commissionRate, payout fields or links. The change goes back to Ops review (6.4).

**mb-host-signup** (Become a Host page): the home page's "Become a MaddyBaba Host" copy, then a three-step form in a white card: 1. About you (display name, handle with the `maddybaba.com/h/{handle}` preview, phone, destination from `/o/c/destinations`); 2. What you offer (role, the five ways to earn as checkboxes, specialty tags, quote with a 160-character counter, bio); 3. Terms (accept host terms and commission policy) and Submit. Guests see "Sign in to become a host" (Liferay sign-in, back to this page). A user who already has a Host sees its status (pending review / active → Host Dashboard).

## 5. Host dashboard (phase 10c)

**mb-host-dashboard**, for signed-in hosts, with Liferay's headless APIs as the host (account roles, data-model.md 6.1–6.2) and the profile endpoints of section 4. A user without a Host is sent to Become a Host; a pending host sees "Your profile is being reviewed".

Layout: navy side rail (desktop) or tab bar (phone) with the sitemap's host sections; cream content area with white cards.

| Tab | Content |
|---|---|
| Overview | Status (Verified / pending), booking link `maddybaba.com/h/{handle}`, stat tiles: total bookings, link clicks, earnings this month, available balance, rating · reviews; next bookings. |
| My Services | The host's listings (account), status (live / in review), price, category; add and edit a listing (title, category incl. Complete Trip, short description, description, price and unit, duration, max guests, destination); inclusions and add-ons. Saving sends it to Ops review. |
| Availability | Per listing: the next 30 days' slots (capacity, booked, status); add slots for a date range with a capacity and optional price; close or reopen a slot. |
| Bookings | The account's bookings: number, lead name, travel date, travelers, total, status. |
| Earnings | Commissions (amount, status, available on), available balance, payout requests (amount ≤ balance, UPI), payout history. |
| Reviews | Published reviews of the host (rating, comment, reviewer). |
| Profile | Section 4's editable fields (PATCH /host-portal/me), with a note that changes go to review. |

## 6. Ops dashboard (phase 10d)

**mb-ops-dashboard**, for Ops Admin (and Administrator), with Liferay's headless APIs as the Ops user. The page is visible to those roles only; the element also shows "Not authorized" to anyone else.

| Tab | Content |
|---|---|
| Overview | Stat tiles: hosts (active / pending), listings (live / in review), bookings this month and their value, commissions pending, payouts requested; zero-result searches this week. |
| Approvals | Review tasks assigned to the Ops roles (`/o/headless-admin-workflow/v1.0/workflow-tasks/assigned-to-my-roles`): Host or Listing, its main fields; Approve or Reject (assign to me, then the transition), with a comment. |
| Reviews | Unpublished reviews (publish), published reviews (feature / unfeature; the home page shows featured ones). |
| Bookings | All bookings with status, total, host, payment status; filter by status. |
| Payouts | Requested payouts: host, amount, method; mark Paid or Failed (the actions service updates the commissions). |
| Search insights | Top queries and zero-result queries from MB_SearchQueryLog (last 30 days), by endpoint. |

## 7. Testing

- `scripts/setup/site.js --verify-only`: every page exists with its elements in order, is visible to the right people (guest gets 200 on public pages, a redirect or 404 on `/ops`), and renders its elements.
- `scripts/setup/e2e.js`: the end-to-end flow through the APIs the elements use (data-model.md, search.md): sign-up → Ops approval → listing → slots → search → booking → payment → commission → payout, plus the forged-payload checks of data-model.md 7.1.
- A browser pass of each page at desktop and phone width against the design.
