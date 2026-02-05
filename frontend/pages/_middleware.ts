import { NextRequest, NextResponse } from 'next/server';

export default function handler(req: NextRequest) {
  // If authentication is disabled, allow everything
  if (process.env.NEXT_PUBLIC_USE_AUTH === 'false') {
    if (process.env.STATALE_MODE === 'true') {
      if (
        !req.nextUrl.pathname.match(/\/documents\/\d+/) &&
        !req.nextUrl.pathname.includes('api')
      ) {
        const url = req.nextUrl.clone();
        url.pathname = `/404`;
        return NextResponse.rewrite(url);
      }
    }
    return NextResponse.next();
  }

  // Allow all requests to pass through
  // Authentication will be handled by getServerSideProps in protected pages
  return NextResponse.next();
}
