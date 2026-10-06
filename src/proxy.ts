import {clerkMiddleware, createRouteMatcher} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/join(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  const {userId, sessionStatus} = await auth();

  // Don't bounce signed-in users off /sign-in here: the token may belong to a deleted Clerk user.
  if (!isPublicRoute(req)) {
    const needsSignIn = userId == null || sessionStatus === 'pending';
    if (needsSignIn) {
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
};
