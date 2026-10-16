export function getPasswordConfirmationError(password, confirmation) {
  if (!confirmation) return "";
  return password === confirmation ? "" : "Passwords do not match.";
}
