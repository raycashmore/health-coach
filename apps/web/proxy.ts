import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function hasOwnerAccess(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const configuredToken = process.env.INTAKE_ACCESS_TOKEN;
  const authorization = request.headers.get("authorization");

  if (!configuredToken || !authorization?.startsWith("Basic ")) {
    return false;
  }

  const encodedCredentials = authorization.slice("Basic ".length);

  try {
    return atob(encodedCredentials) === `owner:${configuredToken}`;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  if (hasOwnerAccess(request)) {
    return NextResponse.next();
  }

  return new NextResponse("Private intake access required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Health Coach intake"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
