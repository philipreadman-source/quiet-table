import {clerkMiddleware, createRouteMatcher} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';

const isAuthPage = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/join(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  const {userId} = await auth();

  if (userId != null && isAuthPage(req)) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (!isPublicRoute(req)) {
    await auth.protect({unauthenticatedUrl: '/sign-in'});
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
};
