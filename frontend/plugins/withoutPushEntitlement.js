const { withEntitlementsPlist } = require('expo/config-plugins')

/**
 * Dromos uses expo-notifications for LOCAL notifications only (the
 * "workout in progress" fallback), which needs no entitlement. The
 * package's config plugin still adds `aps-environment` (remote push),
 * and that capability cannot be signed with a personal development
 * team — blocking device builds. Strip it.
 */
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment']
    return c
  })
}
