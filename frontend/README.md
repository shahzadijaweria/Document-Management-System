### Frontend setup log (Next.js 16 + React 19 + Tailwind v4)

### Step 14a - Next.js scaffold:
###   - npx create-next-app@latest . inside frontend/  (chose: TS yes, ESLint yes, Tailwind yes, App Router yes, no src/, no Turbopack flag - Turbopack is default in Next 16)
###   - installed extra deps: npm install axios socket.io-client react-hot-toast date-fns react-hook-form @hookform/resolvers zod
###   - frontend/.env.local: NEXT_PUBLIC_API_URL=http://localhost:4000  +  NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
###   - heads-up: this scaffold landed without src/, so @/* maps to ./* (root). Files live at frontend/lib/, frontend/contexts/, frontend/app/
###   - Next 16 specifics worth remembering:
###       Turbopack is the default for next dev + next build (no --turbopack flag needed)
###       async Request APIs: cookies(), headers(), params, searchParams are all Promises now (must await)
###       Tailwind v4 uses CSS-based theming (different from v3's tailwind.config.js)
###       node 20.9+ required, TS 5.1+, modern browsers (Chrome/Edge/Firefox 111+, Safari 16.4+)

### Step 14b - foundation (api client + socket client + auth context):
###   - lib/auth.ts:
###       localStorage helpers for tokens + current user (per spec: "localStorage or httpOnly cookies")
###       all getters SSR-safe (return null when typeof window === "undefined")
###   - lib/api.ts:
###       axios instance with refresh-on-401 interceptor
###       request interceptor attaches Authorization: Bearer <token>
###       response interceptor: on 401 (and not already retried, and not an /api/auth/ url) -> POST /api/auth/refresh -> retry original
###       uses a SEPARATE bare axios for the refresh call so the response interceptor doesn't recursively try to refresh on a refresh failure
###       refresh fails -> clearAuth + window.location to /login
###   - lib/socket.ts:
###       singleton Socket.io client; getSocket / connectSocket / disconnectSocket
###       connectSocket reads access token from auth, includes in handshake.auth.token (matches backend's io.use middleware)
###       autoReconnect 5 attempts / 1s base delay; transports: ["websocket"] (skips long-polling fallback)
###   - contexts/auth-context.tsx (use client):
###       AuthProvider wraps app; exposes useAuth() returning { user, isAuthenticated, isLoading, login, register, logout }
###       login/register POST to backend, store tokens+user, connect socket
###       logout calls /api/auth/logout (best-effort; clears local state regardless), disconnects socket, router.push("/login")
###       on mount: hydrate user from localStorage and connect socket if present
###   - app/layout.tsx wraps children in <AuthProvider> + <Toaster position="top-right" /> from react-hot-toast
###   - sanity check: npm run dev -> http://localhost:3000 still shows Next default page; localStorage empty in devtools

### Step 14c - login + register pages:
###   - app/page.tsx replaced: bounces to /dashboard if logged in, /login otherwise (returns null while deciding)
###   - app/login/page.tsx (use client):
###       react-hook-form + zodResolver, schema { email, password }
###       useEffect bounces already-authenticated visitors to /dashboard
###       onSubmit -> useAuth().login() -> toast.success / toast.error (axios.isAxiosError + err.response.data.error.message)
###       inline labels + per-field <p> error messages from formState.errors
###   - app/register/page.tsx (use client): same shape with name + confirmPassword
###       cross-field "passwords match" via zod .refine({ message, path: ["confirmPassword"] })
###       password min 8, max 128 (matches backend rules)
###   - schemas duplicated between frontend/backend on purpose: frontend validates for UX (instant errors as user types/submits), backend validates again for safety (never trust client)
###   - styling: centered card, max-w-md, white bg, soft shadow. Tailwind v4 utility classes (no plugin needed)
###   - tested: signup with mismatched passwords -> inline error; submit valid -> toast "Account created!" + tokens+user in localStorage + socket connects (visible in backend logs) -> redirect to /dashboard (404 expected until 14d)

### Step 14c bonus - password strength indicator (optional bonus per spec):
###   - register page watches password via react-hook-form `watch("password")` and recomputes 4 criteria on each keystroke
###       length >= 8 (the only rule zod actually enforces)
###       contains uppercase letter
###       contains number
###       contains special character
###   - rendered as a checklist (✓ in green pill / empty gray pill) below the password input. Hidden until user starts typing.
###   - guidance only: indicator does NOT block submit. NIST 800-63B advises against complexity rules (length > complexity); 3 of 4 are recommendations, not hard requirements
###   - to enforce all 4 instead: add zod .refine() chains to the schema (1-line change)
###   - error display: ALSO already covered (was 14c) — inline per-field errors via formState.errors + toast on API error via react-hot-toast

### Step 14d - protected dashboard layout + header:
###   - components/Header.tsx: DMS logo, online indicator (live from socket), bell placeholder, user name, logout button
###       online indicator subscribes to socket "connect"/"disconnect" events; green dot when connected, gray when not
###       initial state pulled from socket.connected on mount
###   - app/dashboard/layout.tsx (use client): auth gate
###       useEffect: !isLoading && !isAuthenticated -> router.replace("/login")
###       isLoading -> render minimal Loading spinner (avoids flash of unauth content)
###       !isAuthenticated -> render null while redirecting
###       authed -> render <Header /> + main with <children/>
###   - app/dashboard/page.tsx: welcome greeting + 2 placeholder sections (upload Step 14e, list Step 14f)
###   - layout.tsx pattern: wraps ALL routes under /dashboard/* — header persists across page navigations within the segment
###   - tested:
###       wrong password -> big red toast "Invalid credentials", stays on /login
###       right password -> green toast "Welcome back!" -> lands on dashboard
###       click logout -> /login (clears localStorage + disconnects socket)
###       stop backend -> green dot turns gray within ~5s; restart -> back to green
###   - toast styling improvement (was 14c gripe): colored backgrounds (green for success, red for error), 14px font, 4-5s duration, soft shadow
###   - toaster moved from top-right to bottom-right per user preference

### socket.ts hardening (after Offline-stuck-on bug):
###   - reconnectionAttempts: Infinity (was 5; gave up after ~30s exponential backoff if backend was down longer)
###   - reconnectionDelayMax: 5000  (caps backoff at 5s instead of unbounded growth)
###   - removed transports: ["websocket"] override -> default ["polling","websocket"] gives polling fallback when WS upgrade fails
###   - added console logs for "connect"/"disconnect"/"connect_error" — devtools-friendly debugging

### Step 14e - upload UI (drag-and-drop):
###   - components/UploadZone.tsx: native HTML5 drag/drop + click-to-browse fallback (hidden <input type=file> + ref)
###   - client-side validation matches backend: MIME whitelist + 10MB max. Invalid files get a red toast and never leave the browser.
###   - metadata form (react-hook-form + zod): name, description, categoryId — all optional
###   - category dropdown fetched on mount from GET /api/categories (silent fallback to empty list on error)
###   - axios FormData upload with onUploadProgress -> animated blue progress bar + button text "Uploading... 47%"
###   - drop-zone visual states: gray (idle) / blue (dragging over) / green (file selected)
###   - Cancel button clears file + form + resets <input type=file> via ref
###   - exposes onUploaded callback prop -> wired to refresh document list in 14f
###   - tested: PDF/PNG upload -> 201; zip -> 415-style toast; >10MB -> too-large toast; OS picker via click
###   - backend logs: POST /api/documents/upload 201 + socket emits document:uploaded + notification:new (visible in browser console too)

### Step 14f - document list (search + filter + pagination):
###   - components/DocumentList.tsx: table with name / category badge / size / type / "X ago" via date-fns formatDistanceToNow
###   - search input: debounced 300ms via useEffect+setTimeout cleanup. Triggers refetch with ?search=
###   - category dropdown: fetched once on mount; selecting filters with ?categoryId=. "All categories" clears filter.
###   - filter changes -> reset to page 1 (separate useEffect with [search, categoryId])
###   - pagination: fixed PAGE_SIZE=10. Previous/Next buttons disabled at boundaries. Hidden when totalPages=1.
###   - empty state: differentiated by whether filters are active ("no matches" vs "no docs yet")
###   - loading state: simple "Loading..." text (skeleton would be polish for later)
###   - category badge: inline style with hex+alpha (color + "20" suffix = ~12% bg opacity) - quick way to color-tint without per-category Tailwind classes
###   - REFRESH PATTERN (ENDS at 14f, foundation for 14h):
###       dashboard page owns refreshKey: number state
###       UploadZone.onUploaded -> setRefreshKey(k => k+1)
###       DocumentList useEffect deps include [refreshKey] -> refetches on bump
###       in 14h, same pattern will fire from socket "document:uploaded/updated/deleted" events
###   - actions column: "actions in 14g" placeholder for now

### Step 14g - per-row actions (View / Edit / Delete):
###   - View: window.open(doc.s3Url, "_blank", "noopener") — uses the presigned URL backend already returned
###   - Edit: opens components/EditDocumentModal.tsx (name/description/category form, prefilled with current values)
###       only sends changed fields (PATCH-style); "No changes to save" toast if user opens-and-saves without edits
###       categoryId only sent when non-empty (backend update schema doesn't accept null - matches our 12a simplification)
###   - Delete: inline confirm dialog (small enough not to extract into a file). Backdrop click closes UNLESS busy.
###       red destructive Delete button + gray Cancel button
###   - both modals: fixed-position black/50 backdrop, click-outside-to-close, stopPropagation on the card itself
###   - DASHBOARD REFRESH PATTERN consolidated:
###       const refresh = () => setRefreshKey(k => k + 1)
###       <UploadZone onUploaded={refresh} /> + <DocumentList onChanged={refresh} />
###       single function, both children call it. Will be hooked into socket events in 14h.
###   - tested: edit name -> list shows new name; edit category -> badge updates; delete -> row gone; view -> new tab with file

### Step 14h - realtime: socket events drive UI updates:
###   - dashboard/page.tsx: useEffect subscribes to 4 events on mount, unsubscribes on unmount
###       document:uploaded -> bumpRefresh (silent list refresh)
###       document:updated  -> bumpRefresh
###       document:deleted  -> bumpRefresh
###       notification:new  -> toast(title, { icon: "🔔" })
###   - WHY silent on doc events: user already saw their OWN action's success toast. Same room means socket fires for them too. Second toast = annoying double-notification.
###   - Doc events from ANOTHER TAB of the same user -> list still updates silently (the "automatic via Socket.io" the spec asks for). Visible without re-noisifying.
###   - notification:new always toasts: until 14i adds the bell+dropdown, toast IS the notification UI
###   - useEffect deps: [] (intentional). Inside, uses setRefreshKey directly (stable from useState) so we don't re-subscribe on every render.
###   - tested two-tab same-user: action in tab A -> tab B's list updates + bell toast appears
###   - tested cross-user: action in alice's tab -> bob's tab does NOT see it (per-user rooms working)
###   - tested backend restart: green dot goes gray ~5s, console logs reconnect attempts, restart -> green again, actions resume firing events

### Step 14i - notifications bell + dropdown:
###   - components/NotificationBell.tsx replaces the placeholder bell in Header.tsx
###   - badge: red circle, top-right corner of bell, shows unreadCount (capped "99+"). Hidden when 0.
###   - on mount: GET /api/notifications?page=1&limit=10 -> populates items + unreadCount
###   - on socket "notification:new": refetches (badge animates up; new item at top of dropdown)
###   - dropdown: 320px wide, max-h-96 with overflow-y-auto for scrolling, white card w/ shadow + border, z-50
###   - close on outside click via document mousedown listener (registered only while open, cleaned up on close)
###   - mark single as read: optimistic update (flip read locally + decrement count) -> PATCH /:id/read in background; on failure, refetch + toast
###   - mark all as read: same optimistic pattern -> PATCH /read-all
###   - read items: no cursor pointer, no hover bg, no click handler. Unread items: blue dot indicator + clickable + light blue bg.
###   - dashboard's notification:new toast + bell's notification:new refetch both fire on same event - complementary, no conflict
###   - tested two-tab same-user: action in tab A -> tab B sees badge increment + toast + dropdown reflects new item

### Step 14i polish - cross-tab read sync + scroll-to-clear:
###   - backend: notifications.service.markAsRead now emits "notification:read" { id } via emitToUser
###   - backend: notifications.service.markAllAsRead emits "notifications:read-all"
###   - frontend NotificationBell listens for both and updates local items + unreadCount (no refetch needed)
###       -> tab A reads -> tab B's badge drops within ~50ms over the socket
###   - SCROLL-TO-CLEAR (Discord/Twitter-style):
###       IntersectionObserver in the dropdown when isOpen=true
###       Any unread <li data-id={notif.id}> that becomes >50% visible -> markAsRead(id)
###       Local Set tracks already-triggered ids so scroll-up-then-down doesn't re-PATCH
###       useEffect deps [isOpen, items] - re-creates observer when items mutate, but already-read items skip
###   - net effect: open bell -> badge instantly drops to "what's not in view" -> scroll to bottom -> 0
###   - tested:
###       15 unread, click bell, ~5 visible items become read, badge -> 10
###       scroll to bottom, badge -> 0
###       2 tabs, mark one read in tab A, tab B badge updates without refresh
###       2 tabs, "mark all" in tab A, tab B clears too

### Step 14i polish 2 - suppress duplicate toast on own actions:
###   - bug: tab where upload/edit/delete happens saw TWO toasts (success from UploadZone/Modal + 🔔 from notification:new socket echo). Other tabs correctly saw only the 🔔.
###   - fix in dashboard/page.tsx: lastOwnActionRef = useRef<number>(0)
###       refresh() sets it to Date.now() — called by upload/edit/delete in this tab
###       notification:new handler: if Date.now() - lastOwnActionRef < 2500ms -> skip toast
###   - bell badge still updates in own tab (persistent state); only the floating toast is suppressed
###   - trade-off: if a remote event arrives within 2.5s of a local action, its toast is also skipped. Acceptable for assessment-grade UX. Production fix = per-tab UUID echoed in socket payload.

### Step 14i polish 3 - fixed timing bug + simplified cross-tab sync:
###   - bug 1: socket events arrive at frontend BEFORE the API response that triggered them. So when refresh()->setOwnAction was called AFTER api.post(), the socket listener had already fired and seen stale ref=0 -> toast not skipped.
###   - fix: moved own-action marker to MODULE LEVEL in lib/socket.ts as markOwnAction() / isRecentOwnAction(). Components call markOwnAction() RIGHT BEFORE the API call (UploadZone onSubmit, EditDocumentModal onSubmit, DocumentList handleDelete).
###   - dashboard's notification:new handler now imports isRecentOwnAction() and skips toast when true.
###   - bug 2: cross-tab read sync was trying to update local items array on notification:read event. Broke when the read item wasn't in tab 2's loaded page (user has 50 notifs, tab 2 only loaded latest 10, tab 1 reads #25 -> tab 2's local array doesn't have it -> count off-by-one).
###   - fix: simpler. Just refetchOnAny event (notification:new / :read / :read-all) -> truth always from backend. Slightly more network for much simpler/correct code.

### Header.tsx race fix - "Offline" stuck:
###   - bug: order was setConnected(socket.connected) -> socket.on("connect", ...). If the socket completed its handshake between those two lines, the connect event fired with no listener attached -> Header showed Offline until a manual refresh
###   - fix: swap order. socket.on("connect"/"disconnect", ...) FIRST, then setConnected(socket.connected). Now any timing window is safe:
###       connect fires before subscribe -> setConnected reads .connected=true -> correct
###       connect fires between subscribe and setState -> listener catches it -> correct
###       connect fires after setState -> listener catches it -> correct
###   - rule of thumb: when bridging an event-driven external store into React state, ALWAYS subscribe first, then read the current snapshot. Reading first creates a race window.

### pagination label polish:
###   - was: "Page X of Y"
###   - now: "Showing 1-10 of 50" (bolded numbers). math: start=(page-1)*PAGE_SIZE+1, end=Math.min(page*PAGE_SIZE, total) — Math.min handles partial last page (e.g. 47 total, page 5 -> "41-47")

### admin Categories panel (filling the spec gap):
###   - components/CategoryManager.tsx: list-existing pills + inline form (text + native color picker + Add)
###   - renders nothing if user.role !== "ADMIN" (read user from useAuth(); role is part of JWT-backed AuthUser)
###   - hits POST /api/categories (which requires admin per backend's requireAdmin middleware)
###   - on successful create: optimistic local insert + window.dispatchEvent(new Event("categories-changed"))
###   - UploadZone / DocumentList / EditDocumentModal each listen for the global event and refetch their dropdowns -> new category appears everywhere without a page refresh
###   - flow to test: promote alice to ADMIN via prisma studio -> log out + log back in (fresh JWT carries new role claim) -> Categories panel appears
###   - placement on dashboard: between UploadZone and DocumentList, only visible to admins
