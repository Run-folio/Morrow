export function authFormErrorMessage(input: {
  mode: "sign-in" | "sign-up";
  message?: string | null;
  code?: string | null;
}) {
  const detail = `${input.code ?? ""} ${input.message ?? ""}`.toLowerCase();
  if (detail.includes("email not verified")) {
    return "Email not verified. We sent a fresh verification link. Check your inbox, including spam, then sign in again.";
  }
  if (input.mode === "sign-up" && /already|exist|duplicate|taken/.test(detail)) {
    return "An account already uses this email. Sign in instead, or reset your password if needed.";
  }
  return input.mode === "sign-up"
    ? "We could not create your account just now. Check the details and try again."
    : "We could not sign you in. Check your email and password, then try again.";
}

export function googleAuthCallbackErrorMessage(code: string | null | undefined) {
  const normalized = (code ?? "").trim().toLowerCase().replaceAll(" ", "_");
  if (normalized === "access_denied" || normalized === "cancelled" || normalized === "canceled") {
    return "Google sign-in was cancelled. You can try again or use email instead.";
  }
  if (normalized === "account_not_linked" || normalized === "account_not_linked_to_user") {
    return "This Google email matches an existing Morrovia account that cannot be linked automatically. Sign in with your existing email method to keep using that account; Google can be linked after its email is verified.";
  }
  if (normalized === "account_already_linked_to_different_user") {
    return "That Google account is already connected to another Morrovia account. Sign in with the method already connected to this account.";
  }
  if (normalized === "email_not_found" || normalized === "email_is_missing") {
    return "Google did not provide the verified email Morrovia needs to sign you in. Use email sign-in or choose another Google account.";
  }
  if (/state|callback|invalid_code|no_code|unable_to_get_user_info/.test(normalized)) {
    return "That Google sign-in attempt expired or could not be verified. Start again from this page.";
  }
  return "Google sign-in could not be completed. Please try again or use email instead.";
}
