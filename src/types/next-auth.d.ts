import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
  }
}

// next-auth/jwt re-exports JWT via `export *`, which TypeScript's
// declaration merging doesn't see through — augment the real source
// module instead (next-auth's Session/User above use named re-exports,
// which do merge, so those don't need this workaround).
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
  }
}
