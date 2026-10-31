# Caching and private workspace data

DarSak shares only visitor-independent public discovery reads across requests. The public teacher,
group, teacher-choice, and education-catalogue reads in `src/features/platform/data.ts` use a
60-second Next cache tagged `public-discovery`. Failed or unusable cached reads are not retained;
the caller falls back to a read through its own request client. Teacher publishing and editing
invalidates the tag from server actions, while the 60-second lifetime bounds staleness for changes
made outside the app. See [Architecture](ARCHITECTURE.md#data-and-access).

Viewer identity and private records remain request-specific. `getRequestViewer` uses React's
request-local `cache()` to deduplicate identity and profile reads during one server render; the
result is not a cross-request or process-wide cache. Student and teacher layouts authorize with a
fresh `requireViewer` call before rendering workspace children. Their Suspense fallback contains a
generic shell and loading placeholder only. If authorization redirects or fails after streaming
starts, the response may already contain that generic fallback; Next.js then handles the redirect
or streamed error. Private workspace children and the viewer's name are held behind the authorization
boundary. The exact HTTP redirect status is not part of this streaming behavior.

Private viewer and user-scoped API responses use `Cache-Control: private, no-store` (and `Vary:
Cookie` where applicable), including `/api/viewer`, calendar, and assistant routes. Do not put
private HTML, viewer state, or service-role reads into `unstable_cache`, a shared module cache, or a
public CDN cache. Supabase RLS and the server-side role checks remain the data access controls.

The Next client router may retain dynamic workspace routes for 30 seconds, as configured by
`experimental.staleTimes.dynamic` in `next.config.ts`. Mutating server actions revalidate the
affected student and teacher workspace routes; authentication changes use server actions that
update or clear the current browser's session cookies and redirect. The proxy marks requests with
Supabase session cookies `private, no-store`, and each new server render resolves the viewer again.
The browser security regression test covers a warm member session, local logout, login as an
outsider, and back navigation in that same isolated browser context.
