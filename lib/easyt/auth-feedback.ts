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
