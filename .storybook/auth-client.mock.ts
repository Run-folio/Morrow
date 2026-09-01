"use client";

let activeOwnerId: string | null = null;

function session() {
  return activeOwnerId ? {
    user: {
      id: activeOwnerId,
      name: "Storybook traveller",
      email: "traveller@example.com",
    },
  } : null;
}

export function setStorybookAuthOwner(ownerId: string) {
  activeOwnerId = ownerId;
}

export function resetStorybookAuthOwner() {
  activeOwnerId = null;
}

const successfulMutation = async () => ({ data: {}, error: null });

/**
 * Storybook owns visual and interaction states, not live authentication.
 * Keeping the double at the module boundary lets production components render
 * unchanged while every story receives one stable, authenticated owner.
 */
export const authClient = {
  useSession: () => ({ data: session(), isPending: false, error: null }),
  getSession: async () => ({ data: session(), error: null }),
  signOut: successfulMutation,
  updateUser: successfulMutation,
  requestPasswordReset: successfulMutation,
  resetPassword: successfulMutation,
  signIn: {
    email: successfulMutation,
    social: successfulMutation,
  },
  signUp: {
    email: successfulMutation,
  },
};
