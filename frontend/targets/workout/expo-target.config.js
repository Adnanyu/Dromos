/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'workout',
  displayName: 'Dromos Workout',
  // ActivityKit's modern content API (ActivityContent) needs 16.2.
  deploymentTarget: '16.2',
  bundleIdentifier: '.workout',
  frameworks: ['SwiftUI', 'ActivityKit', 'WidgetKit'],
  colors: {
    $accent: '#0d7c66',
    $widgetBackground: '#07111f',
  },
}
