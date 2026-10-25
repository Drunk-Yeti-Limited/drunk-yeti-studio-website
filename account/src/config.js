// Email rollout: verified Resend domain, saved SMTP, exact website callback configured.
// UI release gates are not backend security controls.
export const launch = Object.freeze({
  registration: true,
  emailCallbacks: true,
  providerCallbacks: false,
  oauthServer: false
});
